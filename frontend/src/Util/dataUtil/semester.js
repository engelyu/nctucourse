const SEMESTER_SUFFIX = { '1': '上學期', '2': '下學期', 'X': '暑期' }

export const semesterToText = (sem) => {
    if (!sem) return ''
    const suffix = SEMESTER_SUFFIX[sem[sem.length - 1]]
    if (suffix === undefined) return sem
    return `${sem.substr(0, 3)}學年度${suffix}`
}
