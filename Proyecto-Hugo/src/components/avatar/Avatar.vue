<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { auth, db, storage } from "@/firebase";
import { updateProfile, updatePassword } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// Reactive references
const user = ref(auth.currentUser);
const displayName = ref("");
const email = ref("");
const newPassword = ref("");
const age = ref("");
const avatarUrl = ref("default-avatar.png");
const error = ref("");
const success = ref("");
const imageFile = ref(null);
const imageUrl = ref("");
const isLoading = ref(false);

// Use computed properties for derived state
const hasChanges = computed(() => {
  return displayName.value !== initialValues.displayName ||
         newPassword.value !== "" ||
         age.value !== initialValues.age ||
         imageFile.value !== null ||
         (imageUrl.value && imageUrl.value !== initialValues.avatarUrl);
});

// Keep track of initial values for comparison
const initialValues = {
  displayName: "",
  avatarUrl: "default-avatar.png",
  age: ""
};

// Use a single function to set user data
function setUserData(data) {
  displayName.value = data.nombre || user.value?.displayName || "";
  email.value = user.value?.email || "";
  avatarUrl.value = data.urlAvatar || user.value?.photoURL || "default-avatar.png";
  age.value = data.age || "";
  
  // Store initial values for comparison
  initialValues.displayName = displayName.value;
  initialValues.avatarUrl = avatarUrl.value;
  initialValues.age = age.value;
}

// Optimized profile fetch with caching and timeout
const profileCache = new Map();
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let fetchPromise = null;

async function fetchUserProfile(uid) {
  // Return cached data if available and fresh
  const cached = profileCache.get(uid);
  if (cached && (Date.now() - cached.timestamp < CACHE_TIMEOUT)) {
    setUserData(cached.data);
    return;
  }
  
  // Use a single fetch promise to avoid multiple parallel requests
  if (fetchPromise) return fetchPromise;
  
  isLoading.value = true;
  
  fetchPromise = getDoc(doc(db, "Profiles", uid))
    .then(userDoc => {
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        
        // Cache the result with timestamp
        profileCache.set(uid, {
          data,
          timestamp: Date.now()
        });
      }
      isLoading.value = false;
      fetchPromise = null;
    })
    .catch(err => {
      console.error("Error fetching user profile:", err);
      isLoading.value = false;
      fetchPromise = null;
    });
    
  return fetchPromise;
}

// Optimized image upload with size checking and compression
async function uploadProfileImage(file, uid) {
  if (!file) return null;
  
  // Check file size
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB
  if (file.size > MAX_SIZE) {
    throw new Error("La imagen es demasiado grande. El tamaño máximo es 2MB.");
  }
  
  const imageStorageRef = storageRef(storage, `Profiles/${uid}/${Date.now()}_${file.name}`);
  await uploadBytes(imageStorageRef, file);
  return getDownloadURL(imageStorageRef);
}

// Optimized profile update with request batching
async function updateProfileInfo() {
  if (!hasChanges.value) {
    success.value = "No hay cambios para guardar.";
    return;
  }

  try {
    if (!user.value) {
      error.value = "El usuario no está autenticado.";
      return;
    }

    isLoading.value = true;
    error.value = "";
    
    // Prepare updates
    let newAvatarUrl = avatarUrl.value;
    const profileUpdates = {};
    const userUpdates = {};

    // Handle image upload (only if needed)
    if (imageFile.value) {
      newAvatarUrl = await uploadProfileImage(imageFile.value, user.value.uid);
    } else if (imageUrl.value && imageUrl.value !== initialValues.avatarUrl) {
      newAvatarUrl = imageUrl.value;
    }

    // Only update fields that have changed
    if (displayName.value !== initialValues.displayName) {
      profileUpdates.displayName = displayName.value;
      userUpdates.nombre = displayName.value;
    }
    
    if (newAvatarUrl !== initialValues.avatarUrl) {
      profileUpdates.photoURL = newAvatarUrl;
      userUpdates.urlAvatar = newAvatarUrl;
    }
    
    if (age.value !== initialValues.age) {
      userUpdates.age = age.value;
    }

    // Execute Firebase updates in parallel
    const updatePromises = [];
    
    // Only update profile if needed
    if (Object.keys(profileUpdates).length > 0) {
      updatePromises.push(updateProfile(user.value, profileUpdates));
    }

    // Only update password if provided
    if (newPassword.value) {
      updatePromises.push(updatePassword(user.value, newPassword.value));
    }

    // Only update user doc if needed
    if (Object.keys(userUpdates).length > 0) {
      updatePromises.push(updateDoc(doc(db, "Profiles", user.value.uid), userUpdates));
    }

    // Wait for all updates to complete
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      
      // Update avatar URL if it changed
      if (newAvatarUrl !== initialValues.avatarUrl) {
        avatarUrl.value = newAvatarUrl;
        initialValues.avatarUrl = newAvatarUrl;
      }
      
      // Reset password field and update initial values
      newPassword.value = "";
      initialValues.displayName = displayName.value;
      initialValues.age = age.value;
      
      success.value = "Perfil actualizado correctamente.";
    } else {
      success.value = "No hay cambios para guardar.";
    }
  } catch (err) {
    error.value = "Error al actualizar el perfil: " + err.message;
    console.error("Profile update error:", err);
  } finally {
    isLoading.value = false;
  }
}

// Optimized file selection handling
function onFileSelected(event) {
  const file = event.target.files ? event.target.files[0] : event;
  if (!file) return;
  
  imageFile.value = file;
  
  // Clear URL input when file is selected
  imageUrl.value = "";
}

// Clear success/error messages after a delay
let messageTimeout = null;
function setTemporaryMessage(message, isError = false) {
  clearTimeout(messageTimeout);
  
  if (isError) {
    error.value = message;
    success.value = "";
  } else {
    success.value = message;
    error.value = "";
  }
  
  messageTimeout = setTimeout(() => {
    error.value = "";
    success.value = "";
  }, 5000);
}

// Setup and cleanup
onMounted(() => {
  if (user.value) {
    fetchUserProfile(user.value.uid);
  }
});

onUnmounted(() => {
  // Clear any pending timeouts
  clearTimeout(messageTimeout);
});
</script>

<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="10" md="8" lg="6">
        <v-card class="profile-edit-card">
          <v-card-title class="text-center text-h4 mt-4">
            <v-icon size="large" class="mr-2">mdi-account-edit</v-icon>
            Editar Perfil
          </v-card-title>
          
          <v-card-text>
            <div class="d-flex justify-center my-4">
              <v-avatar size="150" class="profile-avatar">
                <v-img :src="avatarUrl" alt="Avatar del usuario" cover />
              </v-avatar>
            </div>
            
            <v-form @submit.prevent="updateProfileInfo">
              <v-text-field
                v-model="displayName"
                label="Nombre de usuario"
                variant="outlined"
                prepend-icon="mdi-account"
                :disabled="isLoading"
              ></v-text-field>
              
              <v-text-field
                v-model="email"
                label="Correo electrónico"
                type="email"
                variant="outlined"
                prepend-icon="mdi-email"
                disabled
              ></v-text-field>
              
              <v-text-field
                v-model="age"
                label="Edad"
                type="number"
                variant="outlined"
                prepend-icon="mdi-cake-variant"
                :disabled="isLoading"
              ></v-text-field>
              
              <v-text-field
                v-model="newPassword"
                label="Nueva contraseña"
                type="password"
                variant="outlined"
                prepend-icon="mdi-lock-reset"
                :disabled="isLoading"
                hint="Dejar vacío para no cambiar contraseña"
                persistent-hint
              ></v-text-field>
              
              <v-file-input
                @change="onFileSelected"
                label="Subir imagen"
                accept="image/png, image/jpeg"
                variant="outlined"
                :disabled="isLoading"
                prepend-icon="mdi-camera"
                hint="Máximo 2MB"
                persistent-hint
                show-size
                truncate-length="15"
              ></v-file-input>
              
              <v-text-field
                v-model="imageUrl"
                label="URL del Avatar"
                variant="outlined"
                prepend-icon="mdi-link"
                :disabled="isLoading || !!imageFile"
                hint="Se ignora si sube un archivo"
                persistent-hint
              ></v-text-field>
              
              <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                closable
                class="my-4"
              >
                {{ error }}
              </v-alert>
              
              <v-alert
                v-if="success"
                type="success"
                variant="tonal"
                closable
                class="my-4"
              >
                {{ success }}
              </v-alert>
              
              <v-btn 
                color="primary" 
                type="submit"
                block
                size="large" 
                :loading="isLoading"
                :disabled="isLoading || !hasChanges"
                class="mt-4"
              >
                <v-icon start>mdi-content-save</v-icon>
                Actualizar Perfil
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.profile-edit-card {
  background: #4a2c2a !important;
  border: 2px solid #8b4513;
  border-radius: 8px;
  font-family: 'MedievalSharp', cursive;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4) !important;
  color: #f9ebd7 !important;
}

.profile-avatar {
  border: 3px solid #8b4513 !important;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}

/* Estilizado adicional para elementos de Vuetify */
:deep(.v-field) {
  border-color: #8b4513 !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}

:deep(.v-field__input) {
  color: #f9ebd7 !important;
}

:deep(.v-field__outline) {
  color: #8b4513 !important;
}

:deep(.v-label) {
  color: #d0b49f !important;
}

:deep(.v-btn) {
  font-family: 'MedievalSharp', cursive !important;
  text-transform: none !important;
}
</style>
