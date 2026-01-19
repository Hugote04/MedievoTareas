<script setup>
import { ref } from 'vue';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { collection, setDoc, doc } from "firebase/firestore";
import { auth, db, storage } from "@/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const sUsuarioRe = ref('');
const sPasswordRe = ref('');
const sRepetirPasswordRe = ref('');
const errorMensaje = ref('');
const buenMensaje = ref('');
const sNombreUser = ref('');
const imageFile = ref(null);
const imageUrl = ref('');
const isUploading = ref(false);
const uploadProgress = ref(0);
const downloadURL = ref('');

const emit = defineEmits(["cambiarALogin"]);

// Función para manejar el registro
function presioneAceptar() {
  errorMensaje.value = "";
  buenMensaje.value = "";

  if (!sUsuarioRe.value || !sPasswordRe.value || !sRepetirPasswordRe.value || !sNombreUser.value) {
    errorMensaje.value = "Por favor complete todos los campos";
    return;
  }

  if (sPasswordRe.value !== sRepetirPasswordRe.value) {
    errorMensaje.value = "Las contraseñas no coinciden";
    return;
  }

  createUserWithEmailAndPassword(auth, sUsuarioRe.value, sPasswordRe.value)
    .then(registerOK)
    .catch(registerNOK);
}

// Función para manejar el registro exitoso
async function registerOK(usuarioRegistrado) {
  try {
    let avatarUrl = "default-avatar.png";
    if (imageFile.value) {
      const avatarRef = storageRef(storage, `Profiles/${auth.currentUser.uid}/${imageFile.value.name}`);
      isUploading.value = true;
      const snapshot = await uploadBytes(avatarRef, imageFile.value);
      avatarUrl = await getDownloadURL(snapshot.ref);
    } else if (imageUrl.value) {
      avatarUrl = imageUrl.value;
    }

    await updateProfile(auth.currentUser, {
      displayName: sNombreUser.value,
      photoURL: avatarUrl
    });

    await sendEmailVerification(auth.currentUser);
    buenMensaje.value = "Registro completado. Por favor, verifique su correo electrónico.";
    await crearPerfil(avatarUrl);
  } catch (error) {
    errorMensaje.value = "Error al registrar: " + error.message;
  } finally {
    isUploading.value = false;
  }
}

// Función para manejar el registro fallido
function registerNOK(error) {
  if (error.message.includes("auth/email-already-in-use")) {
    errorMensaje.value = "El correo electrónico ya está en uso. Intente iniciar sesión.";
  } else {
    errorMensaje.value = "Error en el registro: " + error.message;
  }
}

// Función para crear el perfil del usuario en Firestore
async function crearPerfil(avatarUrl) {
  try {
    const profileRef = collection(db, "Profiles");
    const postRef = doc(profileRef, auth.currentUser.uid);
    await setDoc(postRef, { nombre: sNombreUser.value, email: auth.currentUser.email, urlAvatar: avatarUrl });
    perfilInsertadoOK();
  } catch (error) {
    perfilInsertadoNOK(error);
  }
}

// Función para manejar la inserción exitosa del perfil
function perfilInsertadoOK() {
  buenMensaje.value = "Perfil creado correctamente. Ya puedes iniciar sesión.";
  setTimeout(() => {
    emit("cambiarALogin");
  }, 2000);
}

// Función para manejar la inserción fallida del perfil
function perfilInsertadoNOK(error) {
  errorMensaje.value = "Error al insertar perfil: " + error.message;
}

// Función para manejar la cancelación del registro
function presioneCancelar() {
  emit("cambiarALogin");
}

// Función para mostrar la vista de inicio de sesión
function showLogin() {
  const event = new CustomEvent("show-login");
  window.dispatchEvent(event);
}

// Función para manejar la selección de archivos
function archivoSeleccionado(event) {
  if (event && event.target && event.target.files && event.target.files.length > 0) {
    imageFile.value = event.target.files[0];
  } else if (event) {
    imageFile.value = event;
  }
}
</script>

<template>
  <v-container fluid class="fill-height register-container">
    <v-row align="center" justify="center" class="fill-height">
      <v-col cols="12" sm="11" md="9" lg="7" xl="6" class="d-flex justify-center">
        <v-card class="register-card elevation-10">
          <v-card-title class="text-center text-h4 mt-4">
            <v-icon size="large" class="mr-2">mdi-account-plus</v-icon>
            Registro
          </v-card-title>
          
          <v-card-text>
            <v-form @submit.prevent="presioneAceptar">
              <v-text-field
                v-model="sUsuarioRe"
                label="Correo electrónico"
                type="email"
                prepend-icon="mdi-email"
                variant="outlined"
                required
              ></v-text-field>
              
              <v-text-field
                v-model="sPasswordRe"
                label="Contraseña"
                type="password"
                prepend-icon="mdi-lock"
                variant="outlined"
                required
              ></v-text-field>
              
              <v-text-field
                v-model="sRepetirPasswordRe"
                label="Repetir Contraseña"
                type="password"
                prepend-icon="mdi-lock-check"
                variant="outlined"
                required
              ></v-text-field>
              
              <v-text-field
                v-model="sNombreUser"
                label="Nombre"
                prepend-icon="mdi-account"
                variant="outlined"
                required
              ></v-text-field>
              
              <v-file-input
                @change="archivoSeleccionado"
                label="Avatar"
                prepend-icon="mdi-camera"
                accept="image/*"
                variant="outlined"
                show-size
                truncate-length="15"
              ></v-file-input>
              
              <v-text-field
                v-model="imageUrl"
                label="URL del Avatar (opcional)"
                prepend-icon="mdi-link"
                variant="outlined"
                hint="Sólo se usará si no selecciona un archivo"
              ></v-text-field>
              
              <v-alert
                v-if="errorMensaje"
                type="error"
                variant="tonal"
                closable
                class="my-4"
              >
                {{ errorMensaje }}
              </v-alert>
              
              <v-alert
                v-if="buenMensaje"
                type="success"
                variant="tonal"
                closable
                class="my-4"
              >
                {{ buenMensaje }}
              </v-alert>
              
              <v-progress-linear
                v-if="isUploading"
                color="primary"
                indeterminate
                class="mb-4"
              ></v-progress-linear>
              
              <v-btn
                type="submit"
                color="primary"
                block
                class="mt-2"
                size="large"
                :loading="isUploading"
              >
                <v-icon start>mdi-check</v-icon>
                Aceptar
              </v-btn>
              
              <v-btn
                @click="presioneCancelar"
                color="secondary"
                variant="tonal"
                block
                class="mt-3"
              >
                <v-icon start>mdi-cancel</v-icon>
                Cancelar
              </v-btn>
              
              <v-btn
                @click="showLogin"
                color="accent"
                variant="text"
                block
                class="mt-3"
              >
                <v-icon start>mdi-keyboard-return</v-icon>
                Volver al Inicio de Sesión
              </v-btn>
            </v-form>
          </v-card-text>
          
          <v-card-actions class="justify-center pb-6">
            <div class="logo">
              <img src="https://imgur.com/pte08et.png" alt="Logo" />
            </div>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.register-container {
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

.register-card {
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

.register-card:hover {
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

.register-btn {
  font-weight: bold;
  letter-spacing: 1px;
  border-radius: 8px;
  transition: all 0.3s ease;
  padding: 12px 0;
  margin-bottom: 12px;
  font-size: 1.1rem;
}

.register-btn:hover {
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
  .register-card {
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
  .register-card {
    width: 80% !important;
    margin: 0 auto;
    padding: 22px;
  }
  
  .logo img {
    height: 180px;
  }
}

@media (min-width: 961px) and (max-width: 1264px) {
  .register-card {
    max-width: 600px;
    padding: 25px;
  }
}

@media (min-width: 1265px) {
  .register-card {
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
