<script setup>
import { ref } from "vue";
import { storage } from "@/firebase"; // Configuración de Firebase
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";

const auth = getAuth();
const file = ref(null);
const isValid = ref(false);
const uploadProgress = ref(0);
const downloadURL = ref(null);

const onFileChange = (event) => {
  file.value = event.target.files[0];
};

const uploadImage = async () => {
  const user = auth.currentUser;
  if (!user) {
    alert("Por favor inicia sesión para subir imágenes");
    return;
  }

  const uid = user.uid; // UID dinámico
  if (!file.value) {
    alert("Por favor selecciona un archivo");
    return;
  }

  const fileName = `${uid}-${file.value.name}`;
  const storagePath = `Profiles/${uid}/${fileName}`; // Ruta en el bucket de Storage
  const fileRef = storageRef(storage, storagePath);

  const uploadTask = uploadBytesResumable(fileRef, file.value);

  uploadTask.on(
    "state_changed",
    (snapshot) => {
      uploadProgress.value = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
    },
    (error) => {
      console.error("Error al subir imagen:", error);
      alert("Error al subir la imagen");
    },
    async () => {
      downloadURL.value = await getDownloadURL(uploadTask.snapshot.ref);
      alert("Imagen subida exitosamente");
    }
  );
};
</script>

<template>
  <div>
    <input type="file" @change="onFileChange" />
    <button @click="uploadImage">Subir Imagen</button>
    <div v-if="uploadProgress > 0">Progreso: {{ uploadProgress }}%</div>
    <div v-if="downloadURL">URL de descarga: <a :href="downloadURL">{{ downloadURL }}</a></div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.prueba-container {
  max-width: 400px;
  margin: auto;
  padding: 20px;
  background: #f4e1d2;
  border: 2px solid #8b4513;
  border-radius: 8px;
  text-align: center;
  font-family: 'MedievalSharp', cursive;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
button {
  display: block;
  width: 100%;
  margin-bottom: 10px;
  padding: 8px;
  border-radius: 4px;
  border: 2px solid #8b4513;
  font-family: 'MedievalSharp', cursive;
  background-color: #8b4513;
  color: white;
  cursor: pointer;
  transition: background 0.3s ease;
}
button:hover {
  background: #5a2e0e;
}
</style>
