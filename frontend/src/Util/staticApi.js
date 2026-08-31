/**
 * Static-site mode.
 *
 * The course data is already a plain JSON file fetched straight from its host,
 * so the backend only supplies login, a semester -> file index, and per-user
 * blobs. This module answers all of those from localStorage instead, which is
 * enough to run the whole simulation UI with no server at all.
 *
 * Enabled by REACT_APP_STATIC at build time; requests that are not /api/ (the
 * course files themselves) fall through to the real adapter untouched.
 */
import axios from "axios";

export const isStatic = Boolean(process.env.REACT_APP_STATIC);

const PUBLIC = process.env.PUBLIC_URL || "";

const read = (key, fallback) => {
    try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const write = (key, value) => {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        // Quota is shared with the cached course databases; losing a write is
        // better than throwing out of an action creator.
        console.warn("static mode: could not persist", key, err);
    }
};

const now = () => new Date().toISOString();

// --- collect (the real, non-plan timetable) ---------------------------------
// { [semester]: { [course_id]: visible } }
const COLLECT = "static_collect";

const collectOf = (sem) => read(COLLECT, {})[sem] || {};

const putCollect = (sem, courses) => {
    const all = read(COLLECT, {});
    all[sem] = courses;
    write(COLLECT, all);
};

// --- plans ------------------------------------------------------------------
// { nextId, plans: [{ id, name, ref_semester, created_at, updated_at, courses }] }
const PLANS = "static_plans";

const plansState = () => read(PLANS, { nextId: 1, plans: [] });

const publicPlan = (p) => ({
    id: p.id,
    name: p.name,
    ref_semester: p.ref_semester,
    created_at: p.created_at,
    updated_at: p.updated_at,
});

const coursesOf = (p) =>
    Object.keys(p.courses).map((cid) => ({ course_id: cid, visible: p.courses[cid] }));

// --- plain blobs ------------------------------------------------------------
const PROFILE = "static_profile";
const HISTORY = "static_courses_history";
const TRIAL = "static_trial_sim";

const ok = (data, status = 200) => ({ data, status });

const routes = [
    // ---- identity ----
    ["GET", /^\/api\/accounts\/me\/?$/, () =>
        ok({
            is_anonymous: false,
            username: "local",
            email: "",
            social: [],
            nickname: read(PROFILE, { nickname: "" }).nickname,
        })],

    ["POST", /^\/api\/accounts\/setnickname\/?$/, (m, body) => {
        write(PROFILE, { nickname: body.nickname || "" });
        return ok("");
    }],

    // ---- semester index ----
    ["GET", /^\/api\/simulation\/semesters\/?$/, () =>
        ok(window.__STATIC_SEMESTERS__ || [])],

    ["GET", /^\/api\/simulation\/all\/?$/, (m, body, query) => {
        const sems = window.__STATIC_SEMESTERS__ || [];
        const sem = query.get("sem") || sems[0];
        if (!sems.includes(sem)) return ok("", 404);
        return ok({ sem, url: `${PUBLIC}/data/${sem}.json` });
    }],

    // ---- collect ----
    ["GET", /^\/api\/simulation\/user\/?$/, (m, body, query) => {
        const sems = window.__STATIC_SEMESTERS__ || [];
        const sem = query.get("sem") || sems[0];
        return ok({ courses: coursesFromMap(collectOf(sem)) });
    }],

    ["POST", /^\/api\/simulation\/user\/?$/, (m, body) => {
        const sem = body.course_id.split("_")[0];
        const courses = collectOf(sem);
        courses[body.course_id] = body.visible;
        putCollect(sem, courses);
        return ok("", 201);
    }],

    ["DELETE", /^\/api\/simulation\/user\/?$/, (m, body) => {
        const sem = body.course_id.split("_")[0];
        const courses = collectOf(sem);
        delete courses[body.course_id];
        putCollect(sem, courses);
        return ok("");
    }],

    ["GET", /^\/api\/simulation\/user\/clear\/?$/, (m, body, query) => {
        const sems = window.__STATIC_SEMESTERS__ || [];
        putCollect(query.get("sem") || sems[0], {});
        return ok("");
    }],

    // ---- plans ----
    ["GET", /^\/api\/simulation\/plans\/?$/, () =>
        ok({ plans: plansState().plans.map(publicPlan) })],

    ["POST", /^\/api\/simulation\/plans\/?$/, (m, body) => {
        const state = plansState();
        const name = (body.name || "").trim();
        const sems = window.__STATIC_SEMESTERS__ || [];
        if (!name || !sems.includes(body.ref_semester)) return ok("", 400);
        if (state.plans.some((p) => p.name === name))
            return ok({ error: "duplicated_name" }, 409);

        const plan = {
            id: state.nextId,
            name,
            ref_semester: body.ref_semester,
            created_at: now(),
            updated_at: now(),
            courses: {},
        };
        state.nextId += 1;
        state.plans.unshift(plan);
        write(PLANS, state);
        return ok(publicPlan(plan), 201);
    }],

    ["GET", /^\/api\/simulation\/plans\/(\d+)\/?$/, (m) => {
        const plan = findPlan(m[1]);
        if (!plan) return ok("", 404);
        return ok({ ...publicPlan(plan), courses: coursesOf(plan) });
    }],

    ["PATCH", /^\/api\/simulation\/plans\/(\d+)\/?$/, (m, body) => {
        const state = plansState();
        const plan = state.plans.find((p) => String(p.id) === m[1]);
        if (!plan) return ok("", 404);
        const name = (body.name || "").trim();
        if (!name) return ok("", 400);
        if (state.plans.some((p) => p.name === name && p.id !== plan.id))
            return ok({ error: "duplicated_name" }, 409);
        plan.name = name;
        plan.updated_at = now();
        write(PLANS, state);
        return ok(publicPlan(plan));
    }],

    ["DELETE", /^\/api\/simulation\/plans\/(\d+)\/?$/, (m) => {
        const state = plansState();
        const before = state.plans.length;
        state.plans = state.plans.filter((p) => String(p.id) !== m[1]);
        if (state.plans.length === before) return ok("", 404);
        write(PLANS, state);
        return ok("");
    }],

    ["POST", /^\/api\/simulation\/plans\/(\d+)\/courses\/?$/, (m, body) => {
        const state = plansState();
        const plan = state.plans.find((p) => String(p.id) === m[1]);
        if (!plan) return ok("", 404);
        if (body.course_id.split("_")[0] !== plan.ref_semester) return ok("", 400);
        plan.courses[body.course_id] = body.visible;
        plan.updated_at = now();
        write(PLANS, state);
        return ok("", 201);
    }],

    ["DELETE", /^\/api\/simulation\/plans\/(\d+)\/courses\/?$/, (m, body) => {
        const state = plansState();
        const plan = state.plans.find((p) => String(p.id) === m[1]);
        if (!plan) return ok("", 404);
        delete plan.courses[body.course_id];
        plan.updated_at = now();
        write(PLANS, state);
        return ok("");
    }],

    ["GET", /^\/api\/simulation\/plans\/(\d+)\/clear\/?$/, (m) => {
        const state = plansState();
        const plan = state.plans.find((p) => String(p.id) === m[1]);
        if (!plan) return ok("", 404);
        plan.courses = {};
        plan.updated_at = now();
        write(PLANS, state);
        return ok("");
    }],

    // ---- course history / GPA ----
    ["GET", /^\/api\/accounts\/courses_history\/?$/, () => {
        const h = read(HISTORY, { data: "[]", last_updated_time: null });
        return ok(h);
    }],

    ["POST", /^\/api\/accounts\/courses_history\/?$/, (m, body) => {
        if (body.data === undefined) return ok("", 400);
        write(HISTORY, { data: body.data, last_updated_time: now() });
        return ok("");
    }],

    // ---- credit simulator ----
    ["ANY", /^\/api\/accounts\/sim_data$/, () => {
        const t = read(TRIAL, null);
        if (!t) return ok({ success: false, data: "", last_updated_time: "" });
        return ok({
            success: true,
            data: t.data,
            last_updated_time: t.last_updated_time || "",
        });
    }],

    ["POST", /^\/api\/accounts\/sim_confirm$/, () => {
        if (!read(TRIAL, null))
            write(TRIAL, { data: "", imported_courses: "", last_updated_time: null });
        return ok("", 204);
    }],

    ["POST", /^\/api\/accounts\/sim_update$/, (m, body) => {
        const t = read(TRIAL, null);
        if (!t) return ok("", 404);
        write(TRIAL, { ...t, ...body });
        return ok("", 204);
    }],

    ["ANY", /^\/api\/accounts\/sim_imported$/, () => {
        const t = read(TRIAL, null);
        if (!t) return ok({ success: false, imported: "" });
        return ok({ success: true, imported_courses: t.imported_courses });
    }],

    // ---- misc ----
    ["POST", /^\/api\/simulation\/export\/collect_theme\/?$/, () => ok("", 201)],
    ["GET", /^\/api\/bulletins\/?$/, () => ok({ bulletins: window.__STATIC_BULLETINS__ || [] })],
    ["GET", /^\/api\/csrf_token\/?$/, () => ok("")],
];

function coursesFromMap(map) {
    return Object.keys(map).map((cid) => ({ course_id: cid, visible: map[cid] }));
}

function findPlan(id) {
    return plansState().plans.find((p) => String(p.id) === String(id));
}

const parseBody = (data) => {
    if (data === undefined || data === null) return {};
    if (typeof data === "string") {
        try {
            return JSON.parse(data);
        } catch {
            return {};
        }
    }
    return data;
};

export function installStaticApi() {
    const real = axios.defaults.adapter;

    axios.defaults.adapter = (config) => {
        const url = config.url || "";
        if (!url.startsWith("/api/")) return real(config);

        const [path, search] = url.split("?");
        const query = new URLSearchParams(search || "");
        const method = (config.method || "get").toUpperCase();
        const body = parseBody(config.data);

        for (const [verb, pattern, handler] of routes) {
            if (verb !== "ANY" && verb !== method) continue;
            const m = path.match(pattern);
            if (!m) continue;

            const { data, status } = handler(m, body, query);
            const response = { data, status, statusText: "", headers: {}, config, request: {} };
            return status >= 400
                ? Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response, config, isAxiosError: true }))
                : Promise.resolve(response);
        }

        return Promise.reject(
            Object.assign(new Error(`static mode: unhandled ${method} ${path}`), {
                response: { data: "", status: 404, headers: {}, config, request: {} },
                config,
                isAxiosError: true,
            })
        );
    };
}
