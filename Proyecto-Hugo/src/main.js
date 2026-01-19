import { createApp } from 'vue';
import App from './App.vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles'; // Importa los estilos base de Vuetify
import '@mdi/font/css/materialdesignicons.css'; // Importa los estilos de los íconos
import { initializeApp } from 'firebase/app';

// Tu configuración de Firebase (move this from firebase.js or keep it here)
const firebaseConfig = {
  apiKey: "AIzaSyArJG7osdzOiRz5VA3Y3SMGPtcp2yeAcXs",
  authDomain: "actividad-3-4badb.firebaseapp.com",
  projectId: "actividad-3-4badb",
  storageBucket: "actividad-3-4badb.firebasestorage.app",
  messagingSenderId: "874135172557",
  appId: "1:874135172557:web:4daefce5a9fa2848d9c084",
  measurementId: "G-70PKLXFN1C"
};

// Inicializar Firebase aquí, antes de cualquier otro código
initializeApp(firebaseConfig);

// Importa todos los componentes y directivas de Vuetify
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
  },
});

const app = createApp(App);

app.use(vuetify) // Usa Vuetify en tu aplicación
  .mount('#app'); // Monta la aplicación en el contenedor `#app`
