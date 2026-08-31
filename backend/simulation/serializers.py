from rest_framework import serializers


class CourseCollectSerializer(serializers.Serializer):
    course_id = serializers.CharField()
    visible = serializers.BooleanField()


class SimPlanSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(max_length=30)
    ref_semester = serializers.CharField(max_length=5)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class SimPlanUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=30, required=False)
    ref_semester = serializers.CharField(max_length=5, required=False)
