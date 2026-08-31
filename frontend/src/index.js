import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import axios from 'axios'
import { isDev, url_base } from './Util/dev';
import { installStaticApi, isStatic } from './Util/staticApi';

if (isStatic) {
  // No backend to talk to: everything below /api/ is answered from localStorage.
  window.__STATIC_SEMESTERS__ = (process.env.REACT_APP_STATIC_SEMESTERS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  window.__STATIC_BULLETINS__ = [{
    title: '本站為靜態版本',
    content: '沒有登入功能，收藏與預排課表都只存在你自己的瀏覽器裡。清除瀏覽器資料就會消失，也不會同步到其他裝置。',
    timestamp: '', type: 0, priority: 100
  }]
  installStaticApi()
}

axios.defaults.baseURL = url_base
axios.defaults.xsrfCookieName = 'csrftoken'
axios.defaults.xsrfHeaderName = 'X-XSRF-TOKEN'
if (isDev) {
  axios.defaults.withCredentials = true
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
