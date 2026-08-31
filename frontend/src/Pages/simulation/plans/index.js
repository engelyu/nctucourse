import React, { useCallback, useEffect, useState } from 'react'
import { connect } from 'react-redux'
import {
    Button, Container, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, IconButton, List, ListItem, ListItemSecondaryAction, ListItemText,
    MenuItem, TextField, Typography
} from '@material-ui/core'
import AddIcon from '@material-ui/icons/Add'
import DeleteIcon from '@material-ui/icons/Delete'
import EditIcon from '@material-ui/icons/Edit'
import useAxios from 'axios-hooks'
import { useSnackbar } from 'notistack'
import { createPlan, deletePlan, fetchPlans, updatePlan } from '../../../Redux/Actions/index'
import { semesterToText } from '../../../Util/dataUtil/semester'

const NAME_MAX_LENGTH = 30

const PlanDialog = ({ open, title, semesters, initialName, initialSemester, onClose, onSubmit }) => {
    const [name, setName] = useState('')
    const [semester, setSemester] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (open) {
            setName(initialName || '')
            setSemester(initialSemester || (semesters.length > 0 ? semesters[0] : ''))
            setSubmitting(false)
        }
    }, [open, initialName, initialSemester, semesters])

    const canSubmit = name.trim() !== '' && semester !== '' && !submitting

    const handleSubmit = () => {
        if (!canSubmit) return
        setSubmitting(true)
        Promise.resolve(onSubmit(name.trim(), semester)).finally(() => setSubmitting(false))
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label="課表名稱"
                    placeholder="例如：115-2 預排"
                    value={name}
                    onChange={evt => setName(evt.target.value.slice(0, NAME_MAX_LENGTH))}
                    onKeyPress={evt => { if (evt.key === 'Enter') handleSubmit() }}
                />
                <TextField
                    select
                    fullWidth
                    margin="dense"
                    label="參考學期"
                    value={semester}
                    helperText="預排時可選課程的來源，之後仍可更換"
                    onChange={evt => setSemester(evt.target.value)}
                >
                    {semesters.map(sem => (
                        <MenuItem key={sem} value={sem}>{semesterToText(sem)}</MenuItem>
                    ))}
                </TextField>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>取消</Button>
                <Button color="primary" disabled={!canSubmit} onClick={handleSubmit}>確定</Button>
            </DialogActions>
        </Dialog>
    )
}

const Plans = ({ createPlan, updatePlan, deletePlan }) => {
    const [{ data: semesters, error: semesterError }] = useAxios('/api/simulation/semesters/')
    const [plans, setPlans] = useState(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [editing, setEditing] = useState(null)
    const { enqueueSnackbar } = useSnackbar()

    const reload = useCallback(() => {
        fetchPlans()
            .then(setPlans)
            .catch(() => enqueueSnackbar('載入失敗!(網路錯誤)', { variant: 'error' }))
    }, [enqueueSnackbar])

    useEffect(() => { reload() }, [reload])

    useEffect(() => {
        if (semesterError) enqueueSnackbar('學期列表載入失敗!(網路錯誤)', { variant: 'error' })
    }, [semesterError, enqueueSnackbar])

    const reportError = (err) => {
        if (err.response && err.response.status === 409)
            enqueueSnackbar('已經有同名的預排課表了', { variant: 'error' })
        else
            enqueueSnackbar('操作失敗!(網路錯誤)', { variant: 'error' })
    }

    const handleCreate = (name, semester) =>
        createPlan(name, semester)
            .then(() => { setCreateOpen(false); reload() })
            .catch(reportError)

    const handleEdit = (name, semester) => {
        const clearsCourses = semester !== editing.ref_semester
        if (clearsCourses &&
            !window.confirm('更換參考學期會清空這張預排課表已選的課程，確定要更換嗎？'))
            return
        return updatePlan(editing.id, { name, ref_semester: semester })
            .then(() => { setEditing(null); reload() })
            .catch(reportError)
    }

    const handleDelete = (plan) => {
        if (!window.confirm(`確定要刪除「${plan.name}」嗎？`)) return
        deletePlan(plan.id)
            .then(reload)
            .catch(reportError)
    }

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>預排課表</Typography>
            <Typography variant="body2" color="textSecondary">
                預排課表跟真實學期無關，可以自由命名，並挑選任一個過去的學期當作選課的參考。
            </Typography>
            <Button
                style={{ marginTop: 16 }}
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                disabled={!semesters}
                onClick={() => setCreateOpen(true)}
            >
                新增預排課表
            </Button>
            <Divider style={{ marginTop: 16 }} />
            {plans && plans.length === 0 &&
                <Typography style={{ marginTop: 16 }} color="textSecondary">
                    還沒有任何預排課表。
                </Typography>}
            <List>
                {plans && plans.map(plan => (
                    <ListItem key={plan.id} button component="a" href={`/simulation/plan/${plan.id}`}>
                        <ListItemText
                            primary={plan.name}
                            secondary={`參考 ${semesterToText(plan.ref_semester)}`}
                        />
                        <ListItemSecondaryAction>
                            <IconButton edge="end" aria-label="編輯" onClick={() => setEditing(plan)}>
                                <EditIcon />
                            </IconButton>
                            <IconButton edge="end" aria-label="刪除" onClick={() => handleDelete(plan)}>
                                <DeleteIcon />
                            </IconButton>
                        </ListItemSecondaryAction>
                    </ListItem>
                ))}
            </List>
            <PlanDialog
                open={createOpen}
                title="新增預排課表"
                semesters={semesters || []}
                onClose={() => setCreateOpen(false)}
                onSubmit={handleCreate}
            />
            <PlanDialog
                open={editing !== null}
                title="編輯預排課表"
                semesters={semesters || []}
                initialName={editing ? editing.name : ''}
                initialSemester={editing ? editing.ref_semester : ''}
                onClose={() => setEditing(null)}
                onSubmit={handleEdit}
            />
        </Container>
    )
}

const mapDispatchToProps = (dispatch) => ({
    createPlan: (name, semester) => dispatch(createPlan(name, semester)),
    updatePlan: (planId, patch) => dispatch(updatePlan(planId, patch)),
    deletePlan: (planId) => dispatch(deletePlan(planId)),
})

export default connect(null, mapDispatchToProps)(Plans)
