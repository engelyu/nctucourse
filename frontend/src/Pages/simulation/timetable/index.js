import React from 'react'
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import Typography from '@material-ui/core/Typography';
import ButtonBase from '@material-ui/core/ButtonBase';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { getCourseTimesAndRooms } from '../../../Util/dataUtil/course'
import Tooltip from '@material-ui/core/Tooltip';
import { ConvertCourseType2StyleType, CourseTypeColorMap } from '../../../Util/style'
import { makeInfoPageUrl } from '../../../Util/dataUtil/course'
import { removeCollectCourse, toggleCollectCourseVisible, searchTimeCourses, hoverCourse, cancelHoverCourse, canHover } from '../../../Redux/Actions/index'
import { Button } from '@material-ui/core';
import { app_url } from '../../../Util/dev'

const styles = theme => ({
    root: {
        width: '100%',
        padding: theme.spacing(3),
        height: '100%',
        overflow: 'auto'
    },
    tableContainer: {
        [theme.breakpoints.down('sm')]: {
            width: '200%',
            paddingRight: 20
        },
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'center',
        tableLayout: 'fixed'
    },
    td: {
        borderWidth: 1,
        borderColor: '#aaaaaa',
        borderStyle: 'solid',
        height: 50,
        padding: '2px 3px'
    },
    td1: {
        width: '2.5rem',
        whiteSpace: 'nowrap'
    },
    tdx: {
        padding: 0,
        position: 'relative',
        boxSizing: 'border-box',

        '&:hover': {
            outline: "2px #81C4FF solid",
            outlineOffset: "-2px",
            cursor: "pointer",
        },
    },
    preview: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        // sits on top of the cell rather than inside its flow, so nothing
        // is pushed around and the table never changes height
        pointerEvents: 'none',
        border: '2px dashed #3f51b5',
        borderRadius: 6,
        backgroundColor: 'rgba(63, 81, 181, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 2,
    },
    previewText: {
        color: '#283593',
        fontWeight: 600,
        padding: '0 2px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    courseContainer: {
        width: "100%",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "0.2rem",
    }
})

const courseStyles = theme => ({
    course: {
        width: '100%',
        padding: '0.2rem 0.1rem',
        borderRadius: 7.5,

    },
    courseHighlight: {
        // same-course blocks sit on different days and can share a colour with
        // their neighbours, so outline them rather than recolour them.
        // outline takes no space, so the row height never moves.
        outline: '2px solid #283593',
        outlineOffset: '-1px',
    },
    textSpan: {
        display: 'inline-block',
        width: '100%',
        overflow: 'hidden !important',
        textOverflow: 'ellipsis'
    },
    textSpanHide: {
        [theme.breakpoints.up('lg')]: {
            whiteSpace: 'nowrap',
        }
    },
    textTeacherHide: {
        [theme.breakpoints.up('lg')]: {
            display: 'inline'
        },
    },
})

const TimeTableCourse = withStyles(courseStyles)((props) => {
    const { course, roomCode, roomName, time, showRoomCode, hideOverflowText, classes,
        setAnchor, highlighted, onHover, onHoverEnd } = props
    return (
        <ButtonBase
            style={{ width: '100%' }}
            focusRipple
            onMouseEnter={onHover ? () => onHover(course.cos_id) : undefined}
            onMouseLeave={onHoverEnd}
            onClick={(event) => {
                setAnchor({
                    menuAnchorEl: event.currentTarget,
                    menuTarget: course.cos_id,
                    menuTargetTime: time,
                    menuTargetIsCourse: true
                })
                event.stopPropagation()
            }}
            aria-controls="timetable-course-menu"
            aria-haspopup="true"
        >
            <Tooltip title={`${course.cos_cname} ${course.teacher}/${showRoomCode ? roomCode : roomName}`} arrow>
                <div
                    className={clsx(classes.course, highlighted && classes.courseHighlight)}
                    style={{ backgroundColor: course.color || CourseTypeColorMap[ConvertCourseType2StyleType(course.cos_type)] }}>
                    <span className={clsx(classes.textSpan, hideOverflowText ? classes.textSpanHide : "")}>
                        <Typography display="inline" variant="body2">{course.cos_cname} </Typography>
                        <div className={hideOverflowText ? classes.textTeacherHide : ""}>
                            <Typography display="inline" variant="caption">{course.teacher}/</Typography>
                            <Typography display="inline" variant="caption">{showRoomCode ? roomCode : roomName}</Typography>
                        </div>
                    </span>
                </div>
            </Tooltip>
        </ButtonBase>
    )
})

class TimeTable extends React.Component {
    secs = ['M', 'N', 'A', 'B', 'C', 'D', 'X', 'E', 'F', 'G', 'H', 'Y', 'I', 'J', 'K', 'L']
    newSecs = ['y', 'z', '1', '2', '3', '4', 'n', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd']

    constructor(props) {
        super(props)
        this.state = { menuAnchorEl: null, menuTarget: '', menuTargetTime: '', menuTargetIsCourse: true }
        this.closeMenu = this.closeMenu.bind(this)
        this.setAnchor = this.setAnchor.bind(this)
        this.handleCourseSpaceClick = this.handleCourseSpaceClick.bind(this)
    }

    closeMenu() {
        this.setState({ menuAnchorEl: null })
    }

    // Cells the hovered course would take, when it is not on the table yet.
    makePreviewCells() {
        const { hoverCourseId, allCourses, courseIds } = this.props
        if (!hoverCourseId || courseIds.has(hoverCourseId)) return null

        const course = allCourses[hoverCourseId]
        if (!course) return null

        const cells = {}
        for (const time of getCourseTimesAndRooms(course)) {
            const secIdx = this.secs.indexOf(time[1])
            const dayIdx = time[0] - 1
            if (secIdx === -1 || dayIdx < 0) continue
            cells[`${secIdx}_${dayIdx}`] = course.cos_cname
        }
        return Object.keys(cells).length > 0 ? cells : null
    }

    makeCourseClasses() {
        let credits = 0, hours = 0
        let classes = [...Array(this.secs.length)].map(e => [...Array(7)].map(e2 => Array(0)))
        let { courseIds, allCourses } = this.props
        // a collected course may no longer exist in the database
        for (let course of Array.from(courseIds).map(id => allCourses[id]).filter(Boolean)) {
            credits += Number(course['cos_credit'])
            let times = getCourseTimesAndRooms(course)
            hours += times.length
            for (let time of times) {
                const secIdx = this.secs.indexOf(time[1])
                const timeIdx = time[0] - 1
                classes[secIdx][timeIdx].push({
                    course: course,
                    roomCode: time[2],
                    roomName: time[3],
                    time: time.slice(0, 2),
                })
            }
        }
        return [classes, credits, hours]
    }
    handleCourseSpaceClick(e, time) {
        this.setState({
            menuAnchorEl: e.currentTarget,
            menuTargetTime: time,
            menuTargetIsCourse: false
        })
    }
    setAnchor(archorMeta) {
        this.setState(archorMeta)
    }

    render() {
        const { showWeekend, extendTimetable, classes, hideOverflowText, showRoomCode, newTimeCode,
            hoverCourseId } = this.props
        let [courseClasses, credits, hours] = this.makeCourseClasses()
        const previewCells = this.makePreviewCells()
        const hoverEnabled = canHover()
        let titles = newTimeCode ? ['M', 'T', 'W', 'R', 'F'] : ['一', '二', '三', '四', '五']
        if (showWeekend) titles = titles.concat(newTimeCode ? ['S', 'U'] : ['六', '日'])

        return (<div className={classes.root}>
            <div className={classes.tableContainer}>
                { this.props.planName
                    ? <Typography variant="h4">預排課表：{this.props.planName}</Typography>
                    : this.props.semester && <Typography variant="h4">歷年課程：{this.props.semester}</Typography>}
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                    <Typography>總計: {credits}學分/{hours}小時</Typography>
                    {/* 預排課表不在真實學期的課程資料庫裡，匯出頁無法以 sem 取得，改用設定中的圖片匯出 */}
                    {!this.props.planName &&
                        <Button href={app_url(`/simulation/export/?sem=${this.props.semester}`)} style={{display: "inline", "float": "right"}}>匯出課表</Button>}
                </div>
                <table className={classes.table} border={1} id="timetable">
                    <thead>
                        <tr>
                            <td className={clsx(classes.td, classes.td1)}>節數</td>
                            {titles.map(text => <td className={classes.td} key={text}>{text}</td>)}
                        </tr>
                    </thead>
                    <tbody>
                        {courseClasses.map((rowClasses, index) => (<tr key={index}>
                            <td className={clsx(classes.td, classes.td1)}>{newTimeCode ? this.newSecs[index] : this.secs[index]}</td>
                            {rowClasses.slice(0, showWeekend ? 7 : 5).map((cellClasses, index2) => (
                                <td className={clsx(classes.td, classes.tdx)} key={index2}
                                    onClick={e => this.handleCourseSpaceClick(e, [index2 + 1, this.secs[index]])}>
                                    <div className={classes.courseContainer}>
                                        {cellClasses.map(courseData =>
                                            <TimeTableCourse {...courseData}
                                                hideOverflowText={hideOverflowText}
                                                showRoomCode={showRoomCode}
                                                setAnchor={this.setAnchor}
                                                highlighted={hoverCourseId === courseData.course.cos_id}
                                                onHover={hoverEnabled ? this.props.hoverCourse : undefined}
                                                onHoverEnd={hoverEnabled ? this.props.cancelHoverCourse : undefined}
                                                key={courseData.course.cos_id} />

                                        )}
                                    </div>
                                    {previewCells && previewCells[`${index}_${index2}`] !== undefined &&
                                        <div className={classes.preview}>
                                            <Typography variant="caption" className={classes.previewText}>
                                                {previewCells[`${index}_${index2}`]}
                                            </Typography>
                                        </div>}
                                </td>
                            ))}
                        </tr>)).splice(extendTimetable ? 0 : 1, this.secs.length - (extendTimetable ? 0 : 2))}
                    </tbody>
                </table>
            </div>

            <Menu
                id="timetable-course-menu"
                anchorEl={this.state.menuAnchorEl}
                keepMounted
                open={Boolean(this.state.menuAnchorEl)}
                onClose={this.closeMenu}
            >
                {this.state.menuTargetIsCourse &&
                    <MenuItem onClick={() => {
                        this.closeMenu()
                        this.props.setTimetableVisible(this.state.menuTarget, false)
                    }}>隱藏</MenuItem>
                }
                {this.state.menuTargetIsCourse &&
                    <MenuItem onClick={() => {
                        this.closeMenu()
                        this.props.removeCourse(this.state.menuTarget)
                    }}>移除</MenuItem>
                }
                {this.state.menuTargetIsCourse &&
                    <MenuItem onClick={() => {
                        this.closeMenu()
                        window.open(makeInfoPageUrl(this.state.menuTarget))
                    }}>詳細資訊</MenuItem>
                }
                <MenuItem onClick={() => {
                    this.closeMenu()
                    this.props.searchTimeCourses(this.state.menuTargetTime, true)
                }}>找通識</MenuItem>
                <MenuItem onClick={() => {
                    this.closeMenu()
                    this.props.searchTimeCourses(this.state.menuTargetTime)
                }}>找所有課</MenuItem>
            </Menu>
        </div >)
    }
}

const mapStateToProps = (state) => ({
    courseIds: state.courseSim.timetable.courseIds,
    allCourses: state.courseSim.database.courses,
    extendTimetable: state.courseSim.settings.extendTimetable,
    showWeekend: state.courseSim.settings.showWeekend,
    hideOverflowText: state.courseSim.settings.hideOverflowText,
    showRoomCode: state.courseSim.settings.showRoomCode,
    newTimeCode: state.courseSim.settings.newTimeCode,
    hoverCourseId: state.courseSim.hoverCourseId,
})

const mapDispatchToProps = (dispatch, props) => ({
    removeCourse: (courseId) => {
        dispatch(removeCollectCourse(courseId))
    },
    setTimetableVisible: (courseId, visible) => {
        dispatch(toggleCollectCourseVisible(courseId, visible))
    },
    hoverCourse: (courseId) => dispatch(hoverCourse(courseId)),
    cancelHoverCourse: () => dispatch(cancelHoverCourse()),
    searchTimeCourses: (time, commonOnly) => {
        dispatch(searchTimeCourses(time, commonOnly))
        if (props.changeTabIndex) {
            props.changeTabIndex(0)
        }
    },
})

export default connect(mapStateToProps, mapDispatchToProps)(withStyles(styles)(TimeTable))

