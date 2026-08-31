import json
import os
import tempfile

from django.contrib.auth import get_user_model
from django.test import TestCase

from . import models


class SimPlanApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user('tester', password='pw')
        self.other = User.objects.create_user('other', password='pw')
        models.SemesterCoursesMapping.objects.create(semester='1142', file='1142.json')
        models.SemesterCoursesMapping.objects.create(semester='1132', file='1132.json')
        self.client.force_login(self.user)

    def post_json(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type='application/json')

    def create_plan(self, name='115-2 預排', ref_semester='1142'):
        res = self.post_json('/api/simulation/plans/',
                             {'name': name, 'ref_semester': ref_semester})
        return res

    def test_create_and_list_plan(self):
        res = self.create_plan()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['name'], '115-2 預排')

        res = self.client.get('/api/simulation/plans/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['plans']), 1)

    def test_reject_unknown_ref_semester(self):
        self.assertEqual(self.create_plan(ref_semester='9991').status_code, 400)

    def test_reject_blank_name(self):
        self.assertEqual(self.create_plan(name='   ').status_code, 400)

    def test_reject_duplicated_name(self):
        self.create_plan()
        self.assertEqual(self.create_plan().status_code, 409)

    def test_plans_are_private(self):
        plan_id = self.create_plan().json()['id']
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f'/api/simulation/plans/{plan_id}/').status_code, 404)

    def test_add_and_remove_course(self):
        plan_id = self.create_plan().json()['id']
        url = f'/api/simulation/plans/{plan_id}/courses/'

        self.assertEqual(self.post_json(url, {'course_id': '1142_1', 'visible': True}).status_code, 201)
        res = self.client.get(f'/api/simulation/plans/{plan_id}/')
        self.assertEqual(res.json()['courses'], [{'course_id': '1142_1', 'visible': True}])

        # toggling visibility upserts rather than duplicating
        self.post_json(url, {'course_id': '1142_1', 'visible': False})
        res = self.client.get(f'/api/simulation/plans/{plan_id}/')
        self.assertEqual(res.json()['courses'], [{'course_id': '1142_1', 'visible': False}])

        res = self.client.delete(url, data=json.dumps({'course_id': '1142_1'}),
                                 content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get(f'/api/simulation/plans/{plan_id}/').json()['courses'], [])

    def test_reject_course_outside_ref_semester(self):
        plan_id = self.create_plan().json()['id']
        res = self.post_json(f'/api/simulation/plans/{plan_id}/courses/',
                             {'course_id': '1132_1', 'visible': True})
        self.assertEqual(res.status_code, 400)

    def test_plan_courses_do_not_touch_real_collect(self):
        """A plan built on 1142 must not pollute the user's real 1142 timetable."""
        plan_id = self.create_plan().json()['id']
        self.post_json(f'/api/simulation/plans/{plan_id}/courses/',
                       {'course_id': '1142_1', 'visible': True})
        self.assertEqual(models.SimCollect.objects.count(), 0)

    def test_same_course_in_two_plans(self):
        a = self.create_plan(name='plan a').json()['id']
        b = self.create_plan(name='plan b').json()['id']
        for pk in (a, b):
            res = self.post_json(f'/api/simulation/plans/{pk}/courses/',
                                 {'course_id': '1142_1', 'visible': True})
            self.assertEqual(res.status_code, 201)

    def test_rename_plan(self):
        plan_id = self.create_plan().json()['id']
        res = self.client.patch(f'/api/simulation/plans/{plan_id}/',
                                data=json.dumps({'name': '116-1 預排'}),
                                content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], '116-1 預排')

    def test_ref_semester_is_immutable(self):
        """The course pool is fixed at creation, so collected ids stay valid."""
        plan_id = self.create_plan().json()['id']
        self.post_json(f'/api/simulation/plans/{plan_id}/courses/',
                       {'course_id': '1142_1', 'visible': True})
        self.client.patch(f'/api/simulation/plans/{plan_id}/',
                          data=json.dumps({'name': 'renamed', 'ref_semester': '1132'}),
                          content_type='application/json')
        res = self.client.get(f'/api/simulation/plans/{plan_id}/')
        self.assertEqual(res.json()['ref_semester'], '1142')
        self.assertEqual(res.json()['courses'], [{'course_id': '1142_1', 'visible': True}])

    def test_rename_rejects_blank_name(self):
        plan_id = self.create_plan().json()['id']
        res = self.client.patch(f'/api/simulation/plans/{plan_id}/',
                                data=json.dumps({'name': '  '}),
                                content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_updatesem_prunes_plan_courses(self):
        """Re-crawling a semester must drop plan courses that no longer exist."""
        from django.core.management import call_command

        plan_id = self.create_plan().json()['id']
        for cid in ['1142_1', '1142_2']:
            self.post_json(f'/api/simulation/plans/{plan_id}/courses/',
                           {'course_id': cid, 'visible': True})

        meta = os.path.join(tempfile.mkdtemp(), 'crawl.json')
        with open(meta, 'w') as f:
            json.dump({'semester': '1142', 'semesterDataFile': '1142/new/all.json',
                       'courseIds': ['1142_1']}, f)
        call_command('updatesem', meta)

        res = self.client.get(f'/api/simulation/plans/{plan_id}/')
        self.assertEqual(res.json()['courses'], [{'course_id': '1142_1', 'visible': True}])

    def test_clear_and_delete(self):
        plan_id = self.create_plan().json()['id']
        self.post_json(f'/api/simulation/plans/{plan_id}/courses/',
                       {'course_id': '1142_1', 'visible': True})
        self.assertEqual(self.client.get(f'/api/simulation/plans/{plan_id}/clear/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/simulation/plans/{plan_id}/').json()['courses'], [])

        self.assertEqual(self.client.delete(f'/api/simulation/plans/{plan_id}/').status_code, 200)
        self.assertEqual(models.SimPlan.objects.count(), 0)


class SimCustomCourseApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user('tester', password='pw')
        self.other = User.objects.create_user('other', password='pw')
        models.SemesterCoursesMapping.objects.create(semester='1142', file='1142.json')
        self.client.force_login(self.user)

    def post_json(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type='application/json')

    def make_plan(self):
        return self.post_json('/api/simulation/plans/',
                              {'name': 'p', 'ref_semester': '1142'}).json()['id']

    def test_create_for_semester(self):
        res = self.post_json('/api/simulation/custom/?sem=1142',
                             {'name': '清大 演算法', 'time': '3EF', 'color': '#ff0000',
                              'credit': 3, 'teacher': '某老師', 'room': '資電館'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['name'], '清大 演算法')
        self.assertEqual(res.json()['color'], '#ff0000')

        listed = self.client.get('/api/simulation/custom/?sem=1142').json()['courses']
        self.assertEqual(len(listed), 1)

    def test_semester_and_plan_scopes_are_separate(self):
        plan_id = self.make_plan()
        self.post_json('/api/simulation/custom/?sem=1142', {'name': 'sem course'})
        self.post_json(f'/api/simulation/custom/?plan={plan_id}', {'name': 'plan course'})

        sem = self.client.get('/api/simulation/custom/?sem=1142').json()['courses']
        plan = self.client.get(f'/api/simulation/custom/?plan={plan_id}').json()['courses']
        self.assertEqual([c['name'] for c in sem], ['sem course'])
        self.assertEqual([c['name'] for c in plan], ['plan course'])

    def test_reject_blank_name(self):
        res = self.post_json('/api/simulation/custom/?sem=1142', {'name': '   '})
        self.assertEqual(res.status_code, 400)

    def test_reject_bad_colour(self):
        res = self.post_json('/api/simulation/custom/?sem=1142',
                             {'name': 'x', 'color': 'red'})
        self.assertEqual(res.status_code, 400)

    def test_unknown_plan_is_404(self):
        res = self.post_json('/api/simulation/custom/?plan=9999', {'name': 'x'})
        self.assertEqual(res.status_code, 404)

    def test_edit_and_delete(self):
        cid = self.post_json('/api/simulation/custom/?sem=1142',
                             {'name': 'x', 'time': '3EF'}).json()['id']

        res = self.client.patch(f'/api/simulation/custom/{cid}/',
                                data=json.dumps({'name': 'y', 'time': '4AB',
                                                 'color': '#00ff00'}),
                                content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'y')
        self.assertEqual(res.json()['time'], '4AB')

        self.assertEqual(self.client.delete(f'/api/simulation/custom/{cid}/').status_code, 200)
        self.assertEqual(models.SimCustomCourse.objects.count(), 0)

    def test_custom_courses_are_private(self):
        cid = self.post_json('/api/simulation/custom/?sem=1142', {'name': 'x'}).json()['id']
        self.client.force_login(self.other)
        self.assertEqual(self.client.delete(f'/api/simulation/custom/{cid}/').status_code, 404)
        self.assertEqual(self.client.get('/api/simulation/custom/?sem=1142').json()['courses'], [])

    def test_deleting_a_plan_removes_its_custom_courses(self):
        plan_id = self.make_plan()
        self.post_json(f'/api/simulation/custom/?plan={plan_id}', {'name': 'x'})
        self.client.delete(f'/api/simulation/plans/{plan_id}/')
        self.assertEqual(models.SimCustomCourse.objects.count(), 0)
