import React from 'react'
import { BrowserRouter, Switch, Route, Redirect } from 'react-router-dom'
import { connect } from 'react-redux'
import Navbar from './Components/navbar'
import { isMaintaining, app_url } from './Util/dev'
import { isStatic } from './Util/staticApi'
import Maintain from './Components/Maintain'
import FullLoading from './Components/FullLoading'
import { FETCH_STATUS } from './Redux/Actions/index'
import ErrorBoundary from './Components/ErrorBoundary'
import AuthRoute from './Components/AuthRoute'
import Login from './Pages/login'
import Simulation from './Pages/simulation'
import GPA from './Pages/gpa'
import GPAImport from './Pages/gpa/import'
import CourseHistory from './Pages/gpa/history'
import Simulator from './Pages/simulator'
import SimulationHistory from './Pages/simulation/history'
import Profile from './Pages/profile'
import TutorialPage from './Pages/tutorial'
import PrettierTable from './Pages/simulation/prettiertable'
import SimulationPlans from './Pages/simulation/plans'

const Router = (props) => {
    if (isMaintaining) return <Maintain />
    else return (
        <React.Fragment>
            {FETCH_STATUS.FETCHING === props.userFetchStatus && <FullLoading show />}
            <BrowserRouter basename={process.env.PUBLIC_URL}>
                <div>
                    <Navbar />
                    <ErrorBoundary>
                        <Switch>
                            <Route exact path='/' render={() =>
                                // Static mode has no login, so the landing page is the simulator.
                                isStatic ? <Redirect to='/simulation' /> : <Login />
                            } />
                            <Route exact path='/tutorial' component={TutorialPage} />
                            <AuthRoute exact path='/simulation' render={() => {
                                let urlParams = new URLSearchParams(window.location.search);
                                if (urlParams.has('sem')) {
                                    return <Simulation semester={urlParams.get('sem')} />
                                } else {
                                    return <Simulation />
                                }
                            }} />
                            <AuthRoute exact path='/simulation/export' render={() => {
                                let urlParams = new URLSearchParams(window.location.search);
                                if (urlParams.has('sem')) {
                                    return <PrettierTable defaultSemester={urlParams.get('sem')} />
                                } else {
                                    return <PrettierTable />
                                }
                            }} />
                            <AuthRoute exact path='/gpa' component={GPA} />
                            <AuthRoute exact path='/gpa/import' component={GPAImport} />
                            <AuthRoute exact path='/coursehistory' component={CourseHistory} />
                            <AuthRoute exact path='/simulation/history' component={SimulationHistory} />
                            <AuthRoute exact path='/simulation/plans' component={SimulationPlans} />
                            <AuthRoute exact path='/simulation/plan/:planId' render={({ match }) => (
                                <Simulation key={match.params.planId} planId={match.params.planId} />
                            )} />
                            <AuthRoute exact path='/simulator' component={Simulator} />
                            <AuthRoute exact path='/profile' component={Profile} />
                            <Route render={() => {
                                window.location.href = app_url('/')
                            }} />
                        </Switch>
                    </ErrorBoundary>
                </div>
            </BrowserRouter>
        </React.Fragment>
    )
}

const mapStateToProps = (state) => ({
    userFetchStatus: state.user.status
})

export default connect(mapStateToProps)(Router)