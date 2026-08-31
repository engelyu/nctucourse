import axios from "axios";
import { createActions } from "redux-actions";
import {
    makeCourseObject,
    makeObjFromArray,
    getCourseTimesAndRooms,
    filterCommonCourses,
} from "../../Util/dataUtil/course";

const useFakeData = false;
const fakeData = {};

class CustomLocalStorage {
    constructor(options = {}) {
        this.storage = window.localStorage;
        this.maxStorageSize = options.maxStorageSize || 7 * 1024 * 1024; // 8MB
        this.cacheKeyPrefix = "db_cache_";
    }

    enabled() {
        return Boolean(window.localStorage)
    }

    getItem(key) {
        return this.storage.getItem(key);
    }

    setItem(key, value) {
        try {
            this.storage.setItem(key, value);
        } catch (error) {
            if (error instanceof DOMException && error.name === "QuotaExceededError") {
                this.clearOldCaches();
                this.setItem(key, value); // 再次嘗試
            } else {
                throw error;
            }
        }
    }

    clearOldCaches() {
        const keys = Object.keys(this.storage);
        const cacheKeys = keys.filter((key) =>
            key.startsWith(this.cacheKeyPrefix)
        );
        cacheKeys.sort().forEach((key) => {
            if (this.getUsedStorage() < this.maxStorageSize) {
                return;
            }
            this.storage.removeItem(key);
        });
    }

    getUsedStorage() {
        let size = 0;
        const keys = Object.keys(this.storage);
        keys.forEach((key) => {
            size += this.storage.getItem(key).length;
        });
        return size * 2;
    }
}

const localStorage = new CustomLocalStorage()

export const FETCH_STATUS = {
    IDLE: 1,
    FETCHING: 2,
    SUCCESS: 3,
    FAIL: 4,
};

export const actions = createActions({
    USER: {
        STORE: null,
    },
    COURSE_SIM: {
        DATABASE: {
            STORE: null,
        },
        QUERY: {
            STORE: null,
        },
        COLLECT: {
            STORE: null,
            COURSE_IDS: {
                ADD: null,
                REMOVE: null,
                STORE: null,
            },
        },
        TIMETABLE: {
            STORE: null,
            COURSE_IDS: {
                ADD: null,
                REMOVE: null,
                STORE: null,
            },
        },
        SETTINGS: {
            STORE: null,
        },
        PLAN: {
            STORE: null,
            RESET: null,
        },
        CUSTOM: {
            STORE: null,
        },
        HOVER_COURSE: null,
        CANCEL_HOVER_COURSE: null,
    },
});

export const fetchDatabase = (semester) => (dispatch) => {
    dispatch(actions.courseSim.collect.courseIds.store([]));
    dispatch(actions.courseSim.timetable.courseIds.store(new Set()));
    dispatch(
        actions.courseSim.database.store({
            status: FETCH_STATUS.IDLE,
            category: [],
            courses: {},
            categoryMap: {},
        })
    );

    let url = "/api/simulation/all/";
    if (semester !== undefined) {
        url += `?sem=${semester}`;
    }
    axios
        .get(url)
        .then((res) => res.data)
        .then(({ url, sem }) => {
            if (!localStorage.enabled()) return { url, sem };
            let mapp;
            if (localStorage.getItem("database_map") != null) {
                try {
                    mapp = JSON.parse(
                        localStorage.getItem("database_map")
                    );
                } catch {
                    mapp = { [sem]: 0 };
                }
            } else {
                mapp = { [sem]: 0 };
            }
            let cacheUrl = mapp[sem];
            if (cacheUrl === url) {
                try {
                    let cache = JSON.parse(
                        localStorage.getItem(`db_cache_${sem}`)
                    );
                    dispatch(
                        actions.courseSim.database.store({
                            status: FETCH_STATUS.SUCCESS,
                            category: cache.category.map((c) => {
                                c[0] = Number(c[0]);
                                return c;
                            }),
                            courses: cache.courses
                                .map(makeCourseObject)
                                .reduce(makeObjFromArray("cos_id"), {}),
                            categoryMap: cache.category_map,
                        })
                    );
                    dispatch(loadCollect(semester));
                    return { sem: null, url: null };
                } catch {}
            }
            mapp[sem] = url;

            localStorage.setItem("database_map", JSON.stringify(mapp));
            return { url, sem };
        })
        .then(({ url, sem }) => {
            if (url == null) return;
            return axios.get(url, { withCredentials: false }).then((res) => {
                dispatch(
                    actions.courseSim.database.store({
                        status: FETCH_STATUS.SUCCESS,
                        category: res.data.category.map((c) => {
                            c[0] = Number(c[0]);
                            return c;
                        }),
                        courses: res.data.courses
                            .map(makeCourseObject)
                            .reduce(makeObjFromArray("cos_id"), {}),
                        categoryMap: res.data.category_map,
                    })
                );
                if (localStorage.enabled()) {
                    localStorage.setItem(
                        `db_cache_${sem}`,
                        JSON.stringify(res.data)
                    );
                }
                dispatch(loadCollect(semester));
            });
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData) {
                dispatch(
                    actions.courseSim.database.store({
                        status: FETCH_STATUS.SUCCESS,
                        ...fakeData,
                        category: fakeData.data.category.map((c) => {
                            c[0] = Number(c[0]);
                            return c;
                        }),
                        courses: fakeData.courses
                            .map(makeCourseObject)
                            .reduce(makeObjFromArray("cos_id"), {}),
                    })
                );
                dispatch(loadCollect(semester));
            } else {
                dispatch(
                    actions.courseSim.database.store({
                        status: FETCH_STATUS.FAIL,
                    })
                );
            }
        });
};

export const fetchUserInfo = () => (dispatch) => {
    dispatch(actions.user.store({ status: FETCH_STATUS.FETCHING }));
    axios
        .get("/api/accounts/me/")
        .then((res) => {
            dispatch(
                actions.user.store({
                    ...res.data,
                    status: FETCH_STATUS.SUCCESS,
                })
            );
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData)
                dispatch(
                    actions.user.store({
                        is_anonymous: false,
                        username: "0716000",
                        status: FETCH_STATUS.SUCCESS,
                    })
                );
            else
                dispatch(
                    actions.user.store({
                        is_anonymous: true,
                        status: FETCH_STATUS.FAIL,
                    })
                );
        });
};

// A plan ("預排課表") is a free-form, user-named timetable. It borrows its
// course pool from a past semester but keeps its own course list, so the
// collect/timetable endpoints are swapped for the plan-scoped ones below.
const activePlanId = (getState) => getState().courseSim.plan.id;

const collectUrl = (getState) => {
    const planId = activePlanId(getState);
    if (planId != null) return `/api/simulation/plans/${planId}/courses/`;
    return "/api/simulation/user/";
};

export const loadCollect = (semester) => (dispatch, getState) => {
    const planId = activePlanId(getState);
    if (planId != null) dispatch(fetchPlanCourses(planId));
    else dispatch(fetchUserCollect(semester));
    dispatch(fetchCustomCourses(semester));
};

// Custom courses are ordinary course objects that happen to come from the
// user rather than the crawler, so they are merged into the course database
// and the timetable picks them up with no further plumbing.
const customScopeQuery = (getState, semester) => {
    const planId = activePlanId(getState);
    if (planId != null) return `?plan=${planId}`;
    return semester !== undefined ? `?sem=${semester}` : "";
};

const CUSTOM_PREFIX = "custom_";

export const customCourseToCourse = (c) => ({
    cos_id: CUSTOM_PREFIX + c.id,
    cos_cname: c.name,
    cos_code: "",
    cos_credit: String(c.credit || 0),
    cos_hours: "0",
    cos_type: "自訂",
    memo: "",
    num_limit: "",
    reg_num: "",
    teacher: c.teacher || "",
    cos_time: c.room ? `${c.time}-${c.room}` : c.time,
    brief_code: "",
    lang: 0,
    meta: {},
    color: c.color,
    custom: c,
});

export const isCustomCourseId = (courseId) =>
    typeof courseId === "string" && courseId.startsWith(CUSTOM_PREFIX);

const storeCollectedCourses = (dispatch, courses) => {
    let collect = [];
    let timetable = [];
    for (let course of courses) {
        collect.push(course["course_id"]);
        if (course["visible"]) {
            timetable.push(course["course_id"]);
        }
    }
    dispatch(actions.courseSim.collect.courseIds.store(collect));
    dispatch(actions.courseSim.timetable.courseIds.store(timetable));
};

export const fetchUserCollect = (semester) => (dispatch) => {
    let url = "/api/simulation/user/";
    if (semester !== undefined) {
        url += `?sem=${semester}`;
    }
    axios
        .get(url)
        .then((res) => storeCollectedCourses(dispatch, res.data.courses))
        .catch((err) => console.log(err));
};

export const addCollectCourse = (courseId, visible) => (dispatch, getState) => {
    axios
        .post(collectUrl(getState), { course_id: courseId, visible })
        .then(() => {
            dispatch(actions.courseSim.collect.courseIds.add(courseId));
            dispatch(actions.courseSim.timetable.courseIds.add(courseId));
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData) {
                dispatch(actions.courseSim.collect.courseIds.add(courseId));
                dispatch(actions.courseSim.timetable.courseIds.add(courseId));
            }
        });
};

export const removeCollectCourse = (courseId) => (dispatch, getState) => {
    axios
        .delete(collectUrl(getState), { data: { course_id: courseId } })
        .then(() => {
            dispatch(actions.courseSim.collect.courseIds.remove(courseId));
            dispatch(actions.courseSim.timetable.courseIds.remove(courseId));
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData) {
                dispatch(actions.courseSim.collect.courseIds.remove(courseId));
                dispatch(
                    actions.courseSim.timetable.courseIds.remove(courseId)
                );
            }
        });
};

export const toggleCollectCourseVisible = (courseId, visible) => (dispatch, getState) => {
    axios
        .post(collectUrl(getState), { course_id: courseId, visible })
        .then(() => {
            if (visible)
                dispatch(actions.courseSim.timetable.courseIds.add(courseId));
            else
                dispatch(
                    actions.courseSim.timetable.courseIds.remove(courseId)
                );
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData) {
                if (visible)
                    dispatch(
                        actions.courseSim.timetable.courseIds.add(courseId)
                    );
                else
                    dispatch(
                        actions.courseSim.timetable.courseIds.remove(courseId)
                    );
            }
        });
};

export const clearAllUserCourse = (semester) => (dispatch, getState) => {
    const planId = activePlanId(getState);
    let url;
    if (planId != null) {
        url = `/api/simulation/plans/${planId}/clear/`;
    } else {
        url = "/api/simulation/user/clear/";
        if (semester !== undefined) {
            url += `?sem=${semester}`;
        }
    }
    axios
        .get(url)
        .then(() => {
            dispatch(actions.courseSim.timetable.courseIds.store([]));
            dispatch(actions.courseSim.collect.courseIds.store([]));
        })
        .catch((err) => {
            console.log(err);
            if (useFakeData) {
                dispatch(actions.courseSim.timetable.courseIds.store([]));
                dispatch(actions.courseSim.collect.courseIds.store([]));
            }
        });
};

export const loadSavedSettings = () => (dispatch, getState) => {
    if (
        localStorage.enabled() &&
        localStorage.getItem("course_setting") != null
    ) {
        let defaults = getState().courseSim.settings;
        try {
            let saved = JSON.parse(
                localStorage.getItem("course_setting")
            );
            for (let key in defaults) {
                if (saved[key] !== undefined) {
                    defaults[key] = saved[key];
                }
            }
            localStorage.setItem(
                "course_setting",
                JSON.stringify(defaults)
            );
        } catch {
            localStorage.setItem("course_setting", JSON.stringify({}));
        }
        dispatch(actions.courseSim.settings.store(defaults));
    }
};

export const updateSetting = (key, value) => (dispatch) => {
    dispatch(actions.courseSim.settings.store({ [key]: value }));
    if (localStorage.enabled()) {
        try {
            if (localStorage.getItem("course_setting") == null) {
                localStorage.setItem(
                    "course_setting",
                    JSON.stringify({})
                );
            }
            let settings = JSON.parse(
                localStorage.getItem("course_setting")
            );
            settings[key] = value;
            localStorage.setItem(
                "course_setting",
                JSON.stringify(settings)
            );
        } catch {
            localStorage.setItem("course_setting", JSON.stringify({}));
        }
    }
};

export const searchTimeCourses = (time, commonOnly) => (dispatch, getState) => {
    const { category, categoryMap } = getState().courseSim.database;
    let allCourses = Object.values(getState().courseSim.database.courses);
    if (commonOnly)
        allCourses = filterCommonCourses(allCourses, categoryMap, category);
    const courses = allCourses.filter((course) =>
        getCourseTimesAndRooms(course).find(
            (ctime) => ctime[0] === time[0] && ctime[1] === time[1]
        )
    );
    dispatch(setSearchCourseList(courses));
};

export const setSearchCourseList = (courses) => (dispatch) => {
    dispatch(actions.courseSim.query.store({ courseSearchList: courses }));
};

export const setNickname = (nick) => (dispatch) => {
    axios.post("/api/accounts/setnickname/", { nickname: nick }).then((res) => {
        dispatch(actions.user.store({ nickname: nick }));
    });
};

export const resetPlan = () => (dispatch) => {
    dispatch(actions.courseSim.plan.reset());
};

export const enterPlan = (planId) => (dispatch) => {
    dispatch(
        actions.courseSim.plan.store({ id: planId, status: FETCH_STATUS.FETCHING })
    );
    return axios
        .get(`/api/simulation/plans/${planId}/`)
        .then((res) => {
            dispatch(
                actions.courseSim.plan.store({
                    id: res.data.id,
                    name: res.data.name,
                    refSemester: res.data.ref_semester,
                    status: FETCH_STATUS.SUCCESS,
                })
            );
            // Loads the course pool of the reference semester, which in turn
            // dispatches loadCollect -> fetchPlanCourses for this plan.
            dispatch(fetchDatabase(res.data.ref_semester));
        })
        .catch((err) => {
            console.log(err);
            dispatch(actions.courseSim.plan.store({ status: FETCH_STATUS.FAIL }));
        });
};

export const fetchPlanCourses = (planId) => (dispatch) => {
    axios
        .get(`/api/simulation/plans/${planId}/`)
        .then((res) => storeCollectedCourses(dispatch, res.data.courses))
        .catch((err) => console.log(err));
};

export const fetchPlans = () =>
    axios.get("/api/simulation/plans/").then((res) => res.data.plans);

export const createPlan = (name, refSemester) => () =>
    axios
        .post("/api/simulation/plans/", { name, ref_semester: refSemester })
        .then((res) => res.data);

export const updatePlan = (planId, patch) => (dispatch, getState) =>
    axios.patch(`/api/simulation/plans/${planId}/`, patch).then((res) => {
        if (activePlanId(getState) === planId) {
            dispatch(
                actions.courseSim.plan.store({
                    name: res.data.name,
                    refSemester: res.data.ref_semester,
                })
            );
        }
        return res.data;
    });

export const deletePlan = (planId) => () =>
    axios.delete(`/api/simulation/plans/${planId}/`);

const mergeCustomCourses = (dispatch, getState, list) => {
    dispatch(actions.courseSim.custom.store(list));

    const courses = { ...getState().courseSim.database.courses };
    // drop the previous generation before merging, so edits and deletes stick
    for (const id of Object.keys(courses)) {
        if (isCustomCourseId(id)) delete courses[id];
    }
    for (const c of list) {
        const course = customCourseToCourse(c);
        courses[course.cos_id] = course;
    }
    dispatch(actions.courseSim.database.store({ courses }));

    const collect = new Set(
        [...getState().courseSim.collect.courseIds].filter((id) => !isCustomCourseId(id))
    );
    const timetable = new Set(
        [...getState().courseSim.timetable.courseIds].filter((id) => !isCustomCourseId(id))
    );
    for (const c of list) {
        collect.add(CUSTOM_PREFIX + c.id);
        if (c.visible) timetable.add(CUSTOM_PREFIX + c.id);
    }
    dispatch(actions.courseSim.collect.courseIds.store(collect));
    dispatch(actions.courseSim.timetable.courseIds.store(timetable));
};

export const fetchCustomCourses = (semester) => (dispatch, getState) =>
    axios
        .get(`/api/simulation/custom/${customScopeQuery(getState, semester)}`)
        .then((res) => mergeCustomCourses(dispatch, getState, res.data.courses))
        .catch((err) => console.log(err));

export const addCustomCourse = (course, semester) => (dispatch, getState) =>
    axios
        .post(`/api/simulation/custom/${customScopeQuery(getState, semester)}`, course)
        .then(() => dispatch(fetchCustomCourses(semester)));

export const updateCustomCourse = (id, course, semester) => (dispatch, getState) =>
    axios
        .patch(`/api/simulation/custom/${id}/`, course)
        .then(() => dispatch(fetchCustomCourses(semester)));

export const removeCustomCourse = (id, semester) => (dispatch, getState) =>
    axios
        .delete(`/api/simulation/custom/${id}/`)
        .then(() => dispatch(fetchCustomCourses(semester)));
