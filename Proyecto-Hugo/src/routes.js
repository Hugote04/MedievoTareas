import Home from './components/home/Home.vue';
import Login from './components/auth/Login.vue';
import Register from './components/auth/Register.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
];

export default routes;
