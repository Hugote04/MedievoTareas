<script setup>
import { ref, onMounted, computed, onUnmounted, defineAsyncComponent } from "vue";
import { auth, db, getUserCredits } from "@/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

// Lazy load components to improve initial load time
const Home = defineAsyncComponent(() => import("./home/Home.vue"));
const Login = defineAsyncComponent(() => import("./auth/Login.vue"));
const Register = defineAsyncComponent(() => import("./auth/Register.vue"));
const Avatar = defineAsyncComponent(() => import("./avatar/Avatar.vue"));
const Prueba = defineAsyncComponent(() => import("./Prueba/Prueba.vue"));
const Credits = defineAsyncComponent(() => import("./credits/Credits.vue")); // Importar componente de créditos

// Use a single source of truth for view state
const currentView = ref('login');
const isAuthenticated = ref(false);
const user = ref({ displayName: "Usuario", email: "", photoURL: "default-avatar.png" });
const drawer = ref(false);
const isFooterVisible = ref(true);
const userCredits = ref(0); // Variable para almacenar los créditos del usuario
let lastScrollTop = 0;
let scrollTimer = null;
let scrollThreshold = 50; // Umbral mínimo para considerar un cambio significativo
let authUnsubscribe = null;
let creditsUnsubscribe = null; // Listener para los créditos

// Compute view visibility from a single source
const blLoginVisible = computed(() => currentView.value === 'login');
const blHomeVisible = computed(() => currentView.value === 'home');
const blRegisterVisible = computed(() => currentView.value === 'register');
const blAvatarVisible = computed(() => currentView.value === 'avatar');
const blPruebaVisible = computed(() => currentView.value === 'prueba');
const blCreditsVisible = computed(() => currentView.value === 'credits'); // Computar visibilidad

// Función para cerrar sesión y reiniciar los estados
function logout() {
  signOut(auth).then(() => {
    isAuthenticated.value = false;
    user.value = { displayName: "Usuario", email: "", photoURL: "default-avatar.png" };
    currentView.value = 'login';
  });
}

// Función para obtener el perfil del usuario desde Firestore
async function fetchUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "Profiles", uid));
  if (userDoc.exists()) {
    const data = userDoc.data();
    user.value = {
      displayName: data.nombre || "Usuario",
      email: data.email || "",
      photoURL: data.urlAvatar || auth.currentUser.photoURL || "default-avatar.png",
    };
  } else {
    user.value = {
      displayName: auth.currentUser.displayName || "Usuario",
      email: auth.currentUser.email || "",
      photoURL: auth.currentUser.photoURL || "default-avatar.png",
    };
  }
}

// Función para cargar los créditos del usuario
async function loadUserCredits() {
  if (!auth.currentUser) return;
  
  try {
    creditsUnsubscribe = onSnapshot(doc(db, "userCredits", auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        userCredits.value = doc.data().credits || 0;
      } else {
        userCredits.value = 0;
      }
    });
  } catch (err) {
    console.error("Error al cargar los créditos:", err);
    userCredits.value = 0;
  }
}

// Observa cambios en la autenticación del usuario
onMounted(() => {
  authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
      isAuthenticated.value = true;
      fetchUserProfile(currentUser.uid);
      loadUserCredits(); // Cargar los créditos del usuario
      currentView.value = 'home';
    } else {
      isAuthenticated.value = false;
      currentView.value = 'login';
    }
  });

  // Escucha el evento para mostrar la vista de registro
  window.addEventListener('show-register', () => {
    currentView.value = 'register';
  });

  // Escucha el evento para mostrar la vista de home
  window.addEventListener('show-home', () => {
    currentView.value = 'home';
  });

  // Escucha el evento para mostrar la vista de login
  window.addEventListener('show-login', () => {
    currentView.value = 'login';
  });

  // Escucha el evento para mostrar la vista de prueba
  window.addEventListener('show-prueba', () => {
    currentView.value = 'prueba';
  });

  // Escucha el evento para mostrar la vista de créditos
  window.addEventListener('show-credits', () => {
    currentView.value = 'credits';
  });

  // Manejador de eventos de scroll con lógica mejorada
  window.addEventListener("scroll", () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    // Verificar si estamos en la parte inferior de la página
    const isBottom = scrollTop + clientHeight >= scrollHeight - 20;
    
    // Verificar si el cambio de posición del scroll es significativo
    if (Math.abs(scrollTop - lastScrollTop) > scrollThreshold) {
      // Mostrar el footer cuando:
      // 1. El usuario está subiendo (scrollTop menor que lastScrollTop)
      // 2. O cuando el usuario está en el fondo de la página
      if (scrollTop < lastScrollTop || isBottom) {
        isFooterVisible.value = true;
      } 
      // Ocultar el footer cuando el usuario está bajando y no está en el fondo
      else if (scrollTop > lastScrollTop && !isBottom) {
        isFooterVisible.value = false;
      }
      
      // Actualizar la última posición del scroll
      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    }

    // Configurar un temporizador para mostrar el footer después de que el usuario deja de desplazarse
    if (scrollTimer !== null) {
      clearTimeout(scrollTimer);
    }
    
    scrollTimer = setTimeout(() => {
      // Mostrar el footer si el usuario ha dejado de desplazarse durante un tiempo
      // pero solo si está cerca del fondo o en la parte superior
      if (isBottom || scrollTop < 100) {
        isFooterVisible.value = true;
      }
    }, 1500); // Mostrar después de 1.5 segundos de inactividad
  });
});

onUnmounted(() => {
  if (authUnsubscribe) {
    authUnsubscribe();
  }
  if (creditsUnsubscribe) {
    creditsUnsubscribe();
  }
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer);
  }
});

// Funciones para cambiar entre vistas
function showLogin() {
  currentView.value = 'login';
}

function showHome() {
  currentView.value = 'home';
}

function showAvatar() {
  currentView.value = 'avatar';
}

function showRegister() {
  currentView.value = 'register';
}

function showPrueba() {
  currentView.value = 'prueba';
}

function showCredits() {
  currentView.value = 'credits';
}
</script>

<template>
  <v-app>
    <!-- Barra superior -->
    <v-app-bar 
      app 
      color="primary" 
      dark 
      elevation="6"
      class="app-bar"
    >
      <v-app-bar-nav-icon @click="drawer = !drawer" class="mr-2"></v-app-bar-nav-icon>
      
      <div class="header-title-container">
        <img src="/assets/ldp6jo12bele1.gif" alt="Logo GIF" class="header-logo-gif" />
        <v-toolbar-title class="text-h6 font-weight-medium medieval-title">MedievoTareas</v-toolbar-title>
      </div>
      <v-spacer></v-spacer>
      
      <!-- Indicador de créditos que navega a la página de créditos al hacer clic -->
      <v-btn 
        v-if="isAuthenticated"
        @click="showCredits" 
        class="credits-btn mr-2"
        color="amber"
        elevation="2"
        rounded
      >
        <div class="coin-image-container">
          <img src="/assets/conejoKCD2.png" alt="Moneda" class="header-coin-image" />
        </div>
        {{ userCredits }} créditos
      </v-btn>
      
      <!-- Botón de ir a prueba para usuarios no autenticados o como alternativa -->
      <v-btn 
        v-if="!isAuthenticated" 
        @click="showPrueba" 
        color="secondary"
        elevation="2"
        class="mr-2"
        rounded
      >
        <v-icon start>mdi-test-tube</v-icon>
        Ir a Prueba
      </v-btn>
      
      <img src="https://imgur.com/pte08et.png" alt="Logo" class="logo" />
    </v-app-bar>

    <!-- Drawer de navegación -->
    <v-navigation-drawer 
      v-model="drawer" 
      temporary 
      class="navigation-drawer"
      elevation="16"
    >
      <v-list>
        <!-- Perfil del usuario -->
        <v-list-item v-if="isAuthenticated" class="user-profile-item">
          <template v-slot:prepend>
            <v-avatar>
              <v-img :src="user.photoURL || 'https://cdn.vuetifyjs.com/images/john.jpg'" alt="Avatar"></v-img>
            </v-avatar>
          </template>
          <v-list-item-title class="title">{{ user.displayName }}</v-list-item-title>
          <v-list-item-subtitle>{{ auth.currentUser.email }}</v-list-item-subtitle>
        </v-list-item>
        <v-divider v-if="isAuthenticated"></v-divider>

        <!-- Navegación -->
        <v-list-item v-if="isAuthenticated" @click="showHome(); drawer = false" link>
          <template v-slot:prepend>
            <v-icon>mdi-home</v-icon>
          </template>
          <v-list-item-title>Inicio</v-list-item-title>
        </v-list-item>

        <v-list-item v-if="isAuthenticated" @click="showAvatar(); drawer = false" link>
          <template v-slot:prepend>
            <v-icon>mdi-account-edit</v-icon>
          </template>
          <v-list-item-title>Editar Perfil</v-list-item-title>
        </v-list-item>

        <v-list-item v-if="isAuthenticated" @click="showCredits(); drawer = false" link>
          <template v-slot:prepend>
            <div class="drawer-coin-container">
              <img src="/assets/conejoKCD2.png" alt="Moneda" class="drawer-coin-image" />
            </div>
          </template>
          <v-list-item-title class="credits-menu-item">Créditos</v-list-item-title>
        </v-list-item>

        <v-divider v-if="isAuthenticated" class="my-2"></v-divider>

        <v-list-item v-if="isAuthenticated" @click="logout" link>
          <template v-slot:prepend>
            <v-icon>mdi-logout</v-icon>
          </template>
          <v-list-item-title>Cerrar Sesión</v-list-item-title>
        </v-list-item>

        <v-list-item v-else @click="showLogin(); drawer = false" link>
          <template v-slot:prepend>
            <v-icon>mdi-login</v-icon>
          </template>
          <v-list-item-title>Iniciar Sesión</v-list-item-title>
        </v-list-item>

        <v-list-item v-else @click="showRegister(); drawer = false" link>
          <template v-slot:prepend>
            <v-icon>mdi-account-plus</v-icon>
          </template>
          <v-list-item-title>Registrarse</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <!-- Contenido principal -->
    <v-main class="py-6">
      <v-container fluid>
        <transition name="fade" mode="out-in">
          <div>
            <Home v-if="blHomeVisible" />
            <Login v-if="blLoginVisible" />
            <Register v-if="blRegisterVisible" />
            <Avatar v-if="blAvatarVisible" />
            <Prueba v-if="blPruebaVisible" />
            <Credits v-if="blCreditsVisible" /> <!-- Componente de créditos -->
          </div>
        </transition>
      </v-container>
    </v-main>
    
    <!-- Footer (dentro del v-app para evitar errores) -->
    <transition name="slide-fade">
      <v-footer 
        v-if="isFooterVisible" 
        class="medieval-footer"
        elevation="6"
      >
        <v-container class="py-0">
          <v-row align="center" justify="center">
            <v-col cols="12" md="4" class="text-center text-md-left">
              <div class="footer-logo-container">
                <img src="https://imgur.com/pte08et.png" alt="Logo" class="footer-logo" />
                <div class="footer-title">MedievoTareas</div>
              </div>
            </v-col>

            <v-col cols="12" md="4" class="text-center py-2">
              <div class="footer-divider"></div>
              <div class="d-flex justify-center">
                <v-btn
                  icon
                  variant="text"
                  color="amber"
                  href="https://www.instagram.com/hugote04/"
                  target="_blank"
                  class="mx-2 social-btn"
                >
                  <v-icon>mdi-instagram</v-icon>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  color="amber"
                  href="https://x.com/PetardoPutero04"
                  target="_blank"
                  class="mx-2 social-btn"
                >
                  <v-icon>mdi-twitter</v-icon>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  color="amber"
                  href="https://github.com/Hugote04"
                  target="_blank"
                  class="mx-2 social-btn"
                >
                  <v-icon>mdi-github</v-icon>
                </v-btn>
              </div>
              <div class="footer-divider"></div>
            </v-col>

            <v-col cols="12" md="4" class="text-center text-md-right copyright-text">
              <div>© {{ new Date().getFullYear() }} Hugote04</div>
              <div class="mt-1">Todos los derechos reservados</div>
            </v-col>
          </v-row>
        </v-container>
      </v-footer>
    </transition>
  </v-app>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.v-application {
background: transparent;
}

/* Transiciones según Material Design */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}
.fade-enter, .fade-leave-to {
  opacity: 0;
}

.logo {
  height: 40px;
  margin-left: 12px; /* Material Design spacing unit (8px) * 1.5 */
}

/* App Bar con estilos Material Design */
.app-bar {
  background-color: #4a2c2a !important;
  font-family: 'MedievalSharp', serif;
}

/* Navigation Drawer con estilos Material Design */
.navigation-drawer {
  background-color: #4a2c2a !important;
}

.user-profile-item {
  padding: 16px; /* Material Design spacing */
}

.v-list-item {
  color: #fff !important;
  border-radius: 4px; /* Material Design rounded corners */
  margin: 4px 8px; /* Material Design spacing */
}

.v-list-item-icon {
  color: rgba(255, 255, 255, 0.8) !important;
  margin-right: 16px; /* Material Design spacing */
}

.v-list-item-title {
  font-family: 'Cinzel', serif;
  font-weight: 500; /* Material Design medium weight */
  letter-spacing: 0.1px; /* Material Design typography */
}

.v-list-item:hover {
  background-color: rgba(107, 74, 74, 0.7) !important;
}

/* Footer según Material Design */
.medieval-footer {
  font-family: 'Cinzel', serif;
  background-color: #4a2c2a !important;
  color: #f9ebd7;
  border-top: 2px solid #8b4513;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.3);
  padding: 16px 0;
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), 
              opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.slide-fade-enter-active, .slide-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.slide-fade-enter-from, .slide-fade-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* Estilos para el contenido del footer */
.footer-logo-container {
  display: flex;
  align-items: center;
}

.footer-logo {
  height: 40px;
  margin-right: 12px;
}

.footer-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.2rem;
  color: #ffc107;
}

.footer-divider {
  height: 2px;
  background: linear-gradient(to right, transparent, #8b4513, transparent);
  margin: 8px 0;
}

.social-btn {
  background-color: rgba(139, 69, 19, 0.2) !important;
  transition: transform 0.2s, background-color 0.2s;
}

.social-btn:hover {
  transform: translateY(-3px);
  background-color: rgba(139, 69, 19, 0.4) !important;
}

.social-btn:active {
  transform: translateY(-1px);
}

.copyright-text {
  font-size: 0.9rem;
  opacity: 0.8;
  color: #d0b49f;
}

/* Estilos para el botón de créditos compatible con Material Design */
.credits-btn {
  background-color: #ffc107 !important;
  color: #4a2c2a !important;
  font-family: 'MedievalSharp', serif;
  border: none; /* Material Design buttons don't have borders */
  font-weight: 500;
  padding: 0 16px;
  height: 36px; /* Standard Material button height */
  transition: box-shadow 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), 
              background-color 0.2s cubic-bezier(0.4, 0.0, 0.2, 1),
              transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); /* Material Design elevation 2 */
}

.credits-btn:hover {
  background-color: #ffca28 !important; /* Material Design lighter amber */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3); /* Material Design elevation 4 */
  transform: translateY(-1px);
}

.credits-btn:active {
  transform: translateY(0);
  background-color: #ffb300 !important; /* Material Design darker amber */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); /* Material Design elevation 1 */
}

/* Estilizando el icono de moneda para combinar con Material Design */
.coin-stack-icon {
  position: relative;
  width: 24px;
  height: 24px;
  margin-right: 8px; /* Material Design spacing */
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.coin-icon {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 24px !important;
}

.coin-back {
  color: #d4af37;
  z-index: 1;
  animation: none !important;
}

.coin-middle {
  color: #b8860b;
  z-index: 2;
  font-size: 20px !important;
  animation: coin-pulse 2s infinite ease-in-out !important;
}

.coin-front {
  color: #ffd700;
  z-index: 3;
  font-size: 18px !important;
  opacity: 0.85;
  animation: coin-rotate 8s infinite linear !important;
}

@keyframes coin-pulse {
  0%, 100% { 
    transform: scale(0.95); 
    opacity: 0.8;
  }
  50% { 
    transform: scale(1.05); 
    opacity: 1;
  }
}

@keyframes coin-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Estilos para la imagen de moneda en el header */
.coin-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
}

.header-coin-image {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
  animation: coin-pulse 2s infinite ease-in-out;
}

/* Estilos para la imagen de moneda en el drawer */
.drawer-coin-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 31px; /* Aumentar el espacio entre la moneda y el texto */
}

.drawer-coin-image {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}

.header-title-container {
  display: flex;
  align-items: center;
}

.header-logo-gif {
  height: 40px;
  margin-right: 8px;
}

.medieval-title {
  font-family: 'MedievalSharp', cursive !important;
  font-size: 1.6rem !important;
  color: #ffc107 !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  letter-spacing: 1px;
}
</style>