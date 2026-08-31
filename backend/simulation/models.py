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
