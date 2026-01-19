<script setup>
import { ref } from "vue";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider, db } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";

const email = ref("");
const password = ref("");
const error = ref("");

// Función para iniciar sesión con correo y contraseña
function login() {
  signInWithEmailAndPassword(auth, email.value, password.value)
    .then(() => {
      const event = new CustomEvent("show-home");
      window.dispatchEvent(event);
    })
    .catch((err) => {
      if (err.message.includes("auth/user-not-found")) {
        error.value = "Usuario no encontrado. Verifique su correo electrónico.";
      } else if (err.message.includes("auth/wrong-password")) {
        error.value = "Contraseña incorrecta. Intente nuevamente.";
      } else {
        error.value = "Error al iniciar sesión: " + err.message;
      }
    });
}

// Función para iniciar sesión con Google
function loginWithGoogle() {
  signInWithPopup(auth, googleProvider)
    .then(async (result) => {
      const user = result.user;
      const profileRef = doc(db, "Profiles", user.uid);
      await setDoc(profileRef, {
        nombre: user.displayName,
        email: user.email,
        urlAvatar: user.photoURL,
      });
      const event = new CustomEvent("show-home");
      window.dispatchEvent(event);
    })
    .catch((err) => {
      error.value = "Error al iniciar sesión con Google: " + err.message;
    });
}

// Función para continuar sin iniciar sesión
function continueWithoutLogin() {
  const event = new CustomEvent("show-home");
  window.dispatchEvent(event);
}

// Función para mostrar la vista de registro
function showRegister() {
  const event = new CustomEvent("show-register");
  window.dispatchEvent(event);
}
</script>

<template>
  <v-container fluid class="fill-height login-container">
    <v-row align="center" justify="center" class="fill-height">
      <v-col cols="12" sm="11" md="9" lg="7" xl="6" class="d-flex justify-center">
        <v-card class="login-card elevation-10">
          <v-card-title class="text-center text-h4 mt-4">
            <v-icon size="large" class="mr-2">mdi-login</v-icon>
            Iniciar Sesión
          </v-card-title>
          
          <v-card-text>
            <v-form @submit.prevent="login">
              <v-text-field
                v-model="email"
                label="Correo"
                type="email"
                prepend-icon="mdi-email"
                variant="outlined"
                required
                class="custom-field"
              ></v-text-field>
              
              <v-text-field
                v-model="password"
                label="Contraseña"
                type="password"
                prepend-icon="mdi-lock"
                variant="outlined"
                required
                class="custom-field"
              ></v-text-field>
              
              <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                closable
                class="mb-4"
              >
                {{ error }}
              </v-alert>
              
              <v-btn
                type="submit"
                color="primary"
                block
                class="mt-2 login-btn"
                size="large"
              >
                <v-icon start>mdi-login</v-icon>
                Iniciar Sesión
              </v-btn>
            </v-form>
            
            <v-divider class="my-4">
              <span class="text-body-2">O</span>
            </v-divider>
            
            <v-btn
              @click="loginWithGoogle"
              color="error"
              block
              class="mb-3 login-btn"
              size="large"
            >
              <v-icon start>mdi-google</v-icon>
              Iniciar Sesión con Google
            </v-btn>
            
            <v-btn
              @click="continueWithoutLogin"
              color="secondary"
              variant="tonal"
              block
              class="mb-3 login-btn"
            >
              <v-icon start>mdi-account-arrow-right</v-icon>
              Continuar sin iniciar sesión
            </v-btn>
            
            <v-btn
              @click="showRegister"
              color="accent"
              variant="text"
              block
              class="login-btn"
            >
              <v-icon start>mdi-account-plus</v-icon>
              Ir a Registrarse
            </v-btn>
          </v-card-text>
          
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>


<style scoped>
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.login-container {
  min-height: 100vh;
  padding: 0;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

.login-card {
  background: #4a2c2a !important;
  border: 2px solid #8b4513;
  border-radius: 12px !important;
  font-family: 'MedievalSharp', cursive;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6) !important;
  color: #f9ebd7 !important;
  width: 100% !important;
  min-width: 300px;
  max-width: 650px;
  padding: 25px;
  margin: 15px;
  transition: transform 0.3s ease;
}

.login-card:hover {
  transform: translateY(-5px);
}

.v-card-title {
  font-family: 'MedievalSharp', cursive;
  color: #f9ebd7;
  letter-spacing: 1px;
}

.logo {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  width: 100%;
}

.logo img {
  height: 200px;
  max-width: 100%;
  object-fit: contain;
}

.login-btn {
  font-weight: bold;
  letter-spacing: 1px;
  border-radius: 8px;
  transition: all 0.3s ease;
  padding: 12px 0;
  margin-bottom: 12px;
  font-size: 1.1rem;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(0,0,0,0.3);
}

/* Estilizado adicional para elementos de Vuetify */
:deep(.v-field) {
  border-color: #8b4513 !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
  border-radius: 8px !important;
  margin-bottom: 10px;
}

:deep(.v-field__input) {
  color: #f9ebd7 !important;
  font-size: 1.15rem;
  padding: 15px 0;
}

:deep(.v-field__outline) {
  color: #8b4513 !important;
  border-width: 2px !important;
}

:deep(.v-label) {
  color: #d0b49f !important;
  font-size: 1.15rem;
}

:deep(.v-divider) {
  border-color: rgba(249, 235, 215, 0.3) !important;
}

:deep(.v-divider span) {
  background-color: #4a2c2a !important;
  color: #d0b49f !important;
  padding: 0 15px;
}

.v-btn {
  font-family: 'MedievalSharp', cursive !important;
  text-transform: none !important;
  font-size: 1.05rem;
  padding: 12px 20px;
}

/* Estilos responsivos */
@media (max-width: 600px) {
  .login-card {
    width: 90% !important;
    min-width: 300px;
    margin: 10px auto;
    padding: 20px;
  }
  
  .logo img {
    height: 150px;
  }
  
  :deep(.v-field__input),
  :deep(.v-label),
  .v-btn {
    font-size: 1.05rem;
  }

  .v-col {
    padding: 8px;
  }
}

@media (min-width: 601px) and (max-width: 960px) {
  .login-card {
    width: 80% !important;
    margin: 0 auto;
    padding: 22px;
  }
  
  .logo img {
    height: 180px;
  }
}

@media (min-width: 961px) and (max-width: 1264px) {
  .login-card {
    max-width: 600px;
    padding: 25px;
  }
}

@media (min-width: 1265px) {
  .login-card {
    max-width: 700px;
    padding: 30px;
  }
  
  .logo img {
    height: 220px;
  }
  
  :deep(.v-field__input),
  :deep(.v-label) {
    font-size: 1.2rem;
  }
  
  .v-btn {
    font-size: 1.15rem;
    padding: 15px 20px;
  }
}
</style>
