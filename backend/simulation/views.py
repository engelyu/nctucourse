import json

from django.views.generic import View
from django import http
from django.conf import settings
from django.contrib import auth
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured, PermissionDenied, ObjectDoesNotExist

from . import models
from . import serializers
# Create your views here.


class UserCourseCollectView(LoginRequiredMixin, View):
    def get(self, request):
        semester = request.GET.get('sem', settings.SEMESTER)
        if semester is None:
            return http.HttpResponseBadRequest()
        courses = models.SimCollect.objects.filter(user=request.user,
                                                   semester=semester)
        return http.JsonResponse({'courses':
                                  serializers.CourseCollectSerializer(courses, many=True).data})

    def post(self, request):
        parser = serializers.CourseCollectSerializer(data=request.JSON)
        if not parser.is_valid():
            return http.HttpResponseBadRequest()
        course, created = models.SimCollect.objects.get_or_create(user=request.user,
                                                                  course_id=parser.data['course_id'],
                                                                  semester=parser.data['course_id'].split('_')[0])
        course.visible = parser.data['visible']
        course.save()
        return http.HttpResponse('', status=201)

    def delete(self, request):
        course_id = request.JSON.get('course_id')
        if course_id is None:
            return http.HttpResponseBadRequest()
        try:
            course = models.SimCollect.objects.get(
                user=request.user, course_id=course_id)
            course.delete()
        except ObjectDoesNotExist:
            pass
        return http.HttpResponse('')


class ClearUserCoursesView(LoginRequiredMixin, View):
    def get(self, request):
        semester = request.GET.get('sem', settings.SEMESTER)

        courses = models.SimCollect.objects.filter(user=request.user,
                                                   semester=semester)
        courses.delete()
        return http.HttpResponse('', status=200)


class AllCoursesUrlView(View):
    def get(self, request):
        semester = request.GET.get('sem', settings.SEMESTER)

        try:
            mapping = models.SemesterCoursesMapping.objects.get(
                semester=semester)
        except ObjectDoesNotExist:
            return http.HttpResponseNotFound()

        return http.JsonResponse({
            'sem': semester,
            'url': settings.COURSE_FILE_ROOT + mapping.file
        })


class SemesterListView(View):
    def get(self, request):
        sems = models.SemesterCoursesMapping.objects.values(
            'semester').distinct()
        return http.JsonResponse([s['semester'] for s in sems], safe=False)


class TimetableExportCollectThemeView(LoginRequiredMixin, View):
    def post(self, request):
        theme = request.JSON.get('theme')
        try:
            if len(theme) > 30:
                json.loads(theme)
            if len(theme) > 500:
                raise ValueError()
        except:
            return http.HttpResponseBadRequest()

        models.UserTimeTableExportTheme.objects.create(
            user=request.user, theme=theme)
        return http.HttpResponse('', status=201)


def _plan_or_404(request, pk):
    try:
        return models.SimPlan.objects.get(pk=pk, user=request.user)
    except ObjectDoesNotExist:
        return None


class PlanListView(LoginRequiredMixin, View):
    """List the user's plans, or create a new one."""

    def get(self, request):
        plans = models.SimPlan.objects.filter(user=request.user)
        return http.JsonResponse({'plans':
                                  serializers.SimPlanSerializer(plans, many=True).data})

    def post(self, request):
        parser = serializers.SimPlanSerializer(data=request.JSON)
        if not parser.is_valid():
            return http.HttpResponseBadRequest()

        name = parser.validated_data['name'].strip()
        ref_semester = parser.validated_data['ref_semester']
        if not name:
            return http.HttpResponseBadRequest()
        if not models.SemesterCoursesMapping.objects.filter(semester=ref_semester).exists():
            return http.HttpResponseBadRequest()
        if models.SimPlan.objects.filter(user=request.user, name=name).exists():
            return http.JsonResponse({'error': 'duplicated_name'}, status=409)

        plan = models.SimPlan.objects.create(
            user=request.user, name=name, ref_semester=ref_semester)
        return http.JsonResponse(serializers.SimPlanSerializer(plan).data, status=201)


class PlanDetailView(LoginRequiredMixin, View):
    """Read, rename/re-target, or delete a single plan."""

    def get(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()

        data = serializers.SimPlanSerializer(plan).data
        data['courses'] = serializers.CourseCollectSerializer(
            plan.courses.all(), many=True).data
        return http.JsonResponse(data)

    def patch(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()

        parser = serializers.SimPlanUpdateSerializer(data=request.JSON)
        if not parser.is_valid():
            return http.HttpResponseBadRequest()

        name = parser.validated_data['name'].strip()
        if not name:
            return http.HttpResponseBadRequest()
        if models.SimPlan.objects.filter(
                user=request.user, name=name).exclude(pk=plan.pk).exists():
            return http.JsonResponse({'error': 'duplicated_name'}, status=409)

        plan.name = name
        plan.save()
        return http.JsonResponse(serializers.SimPlanSerializer(plan).data)

    def delete(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()
        plan.delete()
        return http.HttpResponse('')


class PlanCourseView(LoginRequiredMixin, View):
    """Add, update the visibility of, or remove a course inside a plan."""

    def post(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()

        parser = serializers.CourseCollectSerializer(data=request.JSON)
        if not parser.is_valid():
            return http.HttpResponseBadRequest()

        course_id = parser.validated_data['course_id']
        if course_id.split('_')[0] != plan.ref_semester:
            return http.HttpResponseBadRequest()

        course, _ = models.SimPlanCollect.objects.get_or_create(
            plan=plan, course_id=course_id)
        course.visible = parser.validated_data['visible']
        course.save()
        plan.save()  # bump updated_at
        return http.HttpResponse('', status=201)

    def delete(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()

        course_id = request.JSON.get('course_id') if request.JSON else None
        if course_id is None:
            return http.HttpResponseBadRequest()

        models.SimPlanCollect.objects.filter(
            plan=plan, course_id=course_id).delete()
        plan.save()
        return http.HttpResponse('')


class PlanClearView(LoginRequiredMixin, View):
    def get(self, request, pk):
        plan = _plan_or_404(request, pk)
        if plan is None:
            return http.HttpResponseNotFound()
        plan.courses.all().delete()
        plan.save()
        return http.HttpResponse('', status=200)
