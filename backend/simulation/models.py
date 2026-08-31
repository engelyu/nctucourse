from django.db import models
from django.contrib.auth import get_user_model

# Create your models here.


class SimCollect(models.Model):
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    course_id = models.CharField(max_length=20)
    semester = models.CharField(max_length=5)
    visible = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'course_id'], name='user_course_id_unique')
        ]


class SemesterCoursesMapping(models.Model):
    semester = models.CharField(max_length=5)
    file = models.TextField()


class UserTimeTableExportTheme(models.Model):
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    theme = models.CharField(max_length=600)
    created_at = models.DateTimeField(auto_now_add=True)


class SimPlan(models.Model):
    """A user-named, free-form timetable plan.

    A plan is decoupled from any real semester: the user picks an existing
    semester only as the *source* of the course pool (``ref_semester``), while
    the plan itself is just a named scratch pad (e.g. "115-2 預排").
    """
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, related_name='sim_plans')
    name = models.CharField(max_length=30)
    ref_semester = models.CharField(max_length=5)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='user_plan_name_unique')
        ]


class SimPlanCollect(models.Model):
    plan = models.ForeignKey(SimPlan, on_delete=models.CASCADE, related_name='courses')
    course_id = models.CharField(max_length=20)
    visible = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['plan', 'course_id'], name='plan_course_id_unique')
        ]


class SimCustomCourse(models.Model):
    """A course the user typed in themselves.

    Covers what the crawler cannot know about: a class cross-registered at
    another school, a time change the course database has not caught up with,
    or anything else that simply occupies a slot in the week.

    It belongs either to a plan or to a real semester, never both.
    """
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE,
                             related_name='sim_custom_courses')
    plan = models.ForeignKey(SimPlan, on_delete=models.CASCADE, null=True, blank=True,
                             related_name='custom_courses')
    semester = models.CharField(max_length=5, blank=True)

    name = models.CharField(max_length=60)
    teacher = models.CharField(max_length=60, blank=True)
    # Old-style time code, matching cos_time on real courses (e.g. "3EF").
    time = models.CharField(max_length=60, blank=True)
    room = models.CharField(max_length=60, blank=True)
    credit = models.FloatField(default=0)
    color = models.CharField(max_length=7, default='#aebed1')
    visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
