<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick, shallowRef } from "vue";
import { db, auth, storage, getUserCredits, deductCredits } from "@/firebase";
import {
  collection, addDoc, getDocs, query, orderBy, Timestamp, deleteDoc, doc, updateDoc, getDoc, where, limit
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import GoogleMap from "@/components/maps/GoogleMap.vue";

// Use shallowRef for complex objects to avoid deep reactivity overhead
const posts = shallowRef([]);
const newPost = ref({ 
  title: "", 
  body: "", 
  imageUrl: "",
  location: { lat: 40.416775, lng: -3.70379 } // Default location (Madrid)
});
const loading = ref(false);
const error = ref("");
const isLoading = ref(false);
const imageFile = ref(null);
const showLocationPicker = ref(false);

// Dialog para mostrar detalles del post
const dialogOpen = ref(false);
const selectedPost = ref(null);

// Dialog para mostrar detalles del autor
const authorDialogOpen = ref(false);
const selectedAuthor = ref(null);

// Use computed properties for maps visibility
const showMap = ref(true);

// Control variables for UI elements with sensible defaults
const mostrarBarraBusqueda = ref(false);
const mostrarOpcionesFiltro = ref(false);
const mostrarDrawer = ref(false);
const mostrarUsuarios = ref(false);
const mostrarTitulos = ref(false);
const mostrarLikes = ref(false);
const mostrarFecha = ref(false); // Control variable for date filter

// Filter and search variables
const buscarTexto = ref("");
const filtroFecha = ref("");
const filtroUsuario = ref("");
const filtroTitulo = ref("");
const filtroLikes = ref("");
const filtroLikesCondicion = ref("mayor");

// Cache results for filters
const usuarios = shallowRef([]);
const titulos = shallowRef([]);

// Request and interaction control
let lastFetchTimestamp = 0;
let postsCache = new Map();
let pendingRequest = null;
const FETCH_THROTTLE_MS = 500; // Minimum time between fetches
const POST_CACHE_EXPIRY_MS = 60000; // 1 minute cache expiry

// Sistema de créditos
const userCredits = ref(0);
const insufficientCreditsDialog = ref(false);
const costDetails = ref({
  base: 5,      // Coste base por crear un post
  location: 0,  // Coste adicional por ubicación
  image: 0,     // Coste adicional por imagen
  longText: 0   // Coste adicional por texto largo
});
const totalCost = computed(() => {
  return costDetails.value.base + 
         costDetails.value.location + 
         costDetails.value.image + 
         costDetails.value.longText;
});

// Use computed properties for derived data
const hasFilters = computed(() => {
  return filtroFecha.value || filtroUsuario.value || filtroTitulo.value || filtroLikes.value || buscarTexto.value.trim();
});

const filterDescription = computed(() => {
  const filters = [];
  if (filtroFecha.value) filters.push(`Fecha: ${filtroFecha.value}`);
  if (filtroUsuario.value) filters.push(`Usuario: ${filtroUsuario.value}`);
  if (filtroTitulo.value) filters.push(`Título: ${filtroTitulo.value}`);
  if (filtroLikes.value) filters.push(`Likes ${filtroLikesCondicion.value} que ${filtroLikes.value}`);
  if (buscarTexto.value.trim()) filters.push(`Búsqueda: ${buscarTexto.value.trim()}`);
  return filters.join(", ");
});

/* 
   Function: descargarPosts
   Description: Fetches posts from Firestore with applied filters.
   Optimized with caching, throttling and query limit
*/
async function descargarPosts() {
  // Throttle fetches to prevent rapid-fire database hits
  const now = Date.now();
  if (now - lastFetchTimestamp < FETCH_THROTTLE_MS && pendingRequest) {
    return pendingRequest;
  }
  
  lastFetchTimestamp = now;
  isLoading.value = true;
  
  // Generate a cache key based on current filters
  const cacheKey = JSON.stringify({
    fecha: filtroFecha.value,
    usuario: filtroUsuario.value,
    titulo: filtroTitulo.value,
    likes: filtroLikes.value,
    likesCondicion: filtroLikesCondicion.value,
    texto: buscarTexto.value.trim()
  });
  
  // Check cache first
  const cachedData = postsCache.get(cacheKey);
  if (cachedData && (Date.now() - cachedData.timestamp < POST_CACHE_EXPIRY_MS)) {
    posts.value = cachedData.data;
    updateFilterLists(cachedData.data);
    isLoading.value = false;
    return;
  }

  try {
    const postsRef = collection(db, "posts");
    // Start with a reasonable limit to prevent loading too many posts
    let q = query(postsRef, orderBy("createdAt", "desc"), limit(50));

    // Apply date filter if provided
    if (filtroFecha.value) {
      const startOfDay = Timestamp.fromDate(new Date(`${filtroFecha.value}T00:00:00`));
      const endOfDay = Timestamp.fromDate(new Date(`${filtroFecha.value}T23:59:59`));
      q = query(q, where("createdAt", ">=", startOfDay), where("createdAt", "<=", endOfDay));
    }

    // Apply user filter if provided
    if (filtroUsuario.value) {
      q = query(q, where("author", "==", filtroUsuario.value));
    }

    // Apply title filter if provided
    if (filtroTitulo.value) {
      q = query(q, where("title", "==", filtroTitulo.value));
    }

    // Apply likes filter if provided
    if (filtroLikes.value) {
      const likesValue = parseInt(filtroLikes.value);
      const operator = filtroLikesCondicion.value === "mayor" ? ">" 
                      : filtroLikesCondicion.value === "menor" ? "<" : "==";
      q = query(q, where("likes", operator, likesValue));
    }

    let fetchedPosts = [];

    // If search text is provided, search by title or tags
    if (buscarTexto.value.trim()) {
      const tituloClave = buscarTexto.value.trim().toLowerCase();
      const qTitle = query(postsRef, where("title", "==", tituloClave));
      const querySnapshotTitle = await getDocs(qTitle);
      let postsByTitle = querySnapshotTitle.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // If no posts found by title, search by tags within each post's UID
      if (postsByTitle.length === 0) {
        const tagClave = buscarTexto.value.trim().toLowerCase();
        const qTags = query(postsRef, where("tags", "array-contains", tagClave));
        const querySnapshotTags = await getDocs(qTags);
        let postsByTags = querySnapshotTags.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        fetchedPosts = postsByTags; // Save posts found by tags
      } else {
        fetchedPosts = postsByTitle; // Save posts found by title
      }
    } else {
      // If no search text, fetch posts with the applied filters
      const querySnapshot = await getDocs(q);
      fetchedPosts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    // Update the reactive state
    posts.value = fetchedPosts;
    
    // Update filter lists from fetched posts
    updateFilterLists(fetchedPosts);
    
    // Cache the results
    postsCache.set(cacheKey, {
      data: fetchedPosts,
      timestamp: Date.now()
    });

    return fetchedPosts;
  } catch (err) {
    console.error("Error al obtener posts:", err.message);
    error.value = "Error al obtener posts.";
    return [];
  } finally {
    isLoading.value = false;
    pendingRequest = null;
  }
}

// Update filter lists without recreating arrays
function updateFilterLists(postsData) {
  // Use Set for efficient unique filtering
  const uniqueUsers = new Set(postsData.map(post => post.author).filter(Boolean));
  const uniqueTitles = new Set(postsData.map(post => post.title).filter(Boolean));
  
  // Only update refs if values have changed (prevents unnecessary rerenders)
  if (uniqueUsers.size !== usuarios.value.length || 
      !usuarios.value.every(user => uniqueUsers.has(user))) {
    usuarios.value = [...uniqueUsers];
  }
  
  if (uniqueTitles.size !== titulos.value.length || 
      !titulos.value.every(title => uniqueTitles.has(title))) {
    titulos.value = [...uniqueTitles];
  }
}

/*
   Function: buscarPorTag
   Description: Optimized search by tag with debouncing
*/
let searchTimeout = null;
async function buscarPorTag() {
  // Clear any pending search
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Set a small timeout to avoid rapid-fire searches
  searchTimeout = setTimeout(async () => {
    if (!buscarTexto.value.trim()) return descargarPosts();
    
    isLoading.value = true;
    try {
      const q = query(collection(db, "posts"), 
                     where("tags", "array-contains", buscarTexto.value.trim().toLowerCase()),
                     limit(50));
      const querySnapshot = await getDocs(q);
      posts.value = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Update filter lists after search
      updateFilterLists(posts.value);
    } catch (err) {
      console.error("Error searching by tag:", err);
      error.value = "Error en la búsqueda.";
    } finally {
      isLoading.value = false;
    }
  }, 300);
}

/*
   Function: handleLocationSelected
   Description: Updates the newPost object with the selected location.
*/
function handleLocationSelected(location) {
  newPost.value.location = location;
  updateCostDetails(); // Update cost details when location is selected
}

/*
   Function: toggleLocationPicker
   Description: Toggles the visibility of the location picker.
*/
function toggleLocationPicker() {
  showLocationPicker.value = !showLocationPicker.value;
}

/*
   Function: toggleMap
   Description: Toggles the visibility of the posts map.
*/
function toggleMap() {
  showMap.value = !showMap.value;
}

/*
   Function: toggleDrawer
   Description: Toggles the visibility of the filter drawer.
*/
function toggleDrawer() {
  mostrarDrawer.value = !mostrarDrawer.value;
}

/*
   Function: toggleFiltroUsuarios
   Description: Toggles the user filter visibility.
*/
function toggleFiltroUsuarios() {
  mostrarUsuarios.value = !mostrarUsuarios.value;
}

/*
   Function: toggleFiltroTitulos
   Description: Toggles the title filter visibility.
*/
function toggleFiltroTitulos() {
  mostrarTitulos.value = !mostrarTitulos.value;
}

/*
   Function: toggleFiltroLikes
   Description: Toggles the likes filter visibility.
*/
function toggleFiltroLikes() {
  mostrarLikes.value = !mostrarLikes.value;
}

/*
   Function: toggleFiltroFecha
   Description: Toggles the date filter visibility.
*/
function toggleFiltroFecha() {
  mostrarFecha.value = !mostrarFecha.value;
}

/*
   Function: addPost
   Description: Adds a new post to Firestore with optimized image upload.
*/
async function addPost() {
  if (!auth.currentUser) {
    error.value = "Debes iniciar sesión para agregar un post.";
    return;
  }

  if (!newPost.value.title || !newPost.value.body) {
    error.value = "El título y el contenido son obligatorios.";
    return;
  }

  // Check if user has enough credits
  if (userCredits.value < totalCost.value) {
    insufficientCreditsDialog.value = true;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    // Process image only if needed
    let imageUrl = newPost.value.imageUrl;
    if (imageFile.value) {
      // Check image size before uploading
      if (imageFile.value.size > 5 * 1024 * 1024) {
        error.value = "La imagen es demasiado grande. Máximo 5MB.";
        loading.value = false;
        return;
      }
      
      const imageStorageRef = storageRef(storage, `Profiles/${auth.currentUser.uid}/${Date.now()}_${imageFile.value.name}`);
      await uploadBytes(imageStorageRef, imageFile.value);
      imageUrl = await getDownloadURL(imageStorageRef);
    }

    // Generate tags efficiently
    const tags = generateTags(newPost.value.title, newPost.value.body);

    const post = {
      title: newPost.value.title,
      body: newPost.value.body,
      location: newPost.value.location,  // Include location data
      author: auth.currentUser.displayName,
      email: auth.currentUser.email,
      avatar: auth.currentUser.photoURL || "default-avatar.png",
      imageUrl,
      userId: auth.currentUser.uid,
      createdAt: Timestamp.now(),
      completed: false,
      tags: tags,
      likes: 0, // Initialize with 0 likes
      likedBy: [], // List of users who liked
    };

    // Add to Firestore
    const docRef = await addDoc(collection(db, "posts"), post);
    
    // Deduct credits
    await deductCredits(
      auth.currentUser.uid, 
      totalCost.value, 
      `Creación de post "${newPost.value.title}" (Base: ${costDetails.value.base}, Imagen: ${costDetails.value.image}, Ubicación: ${costDetails.value.location}, Texto largo: ${costDetails.value.longText})`
    );
    userCredits.value -= totalCost.value;
    
    // Mostrar animación de monedas
    showCoinAnimation();

    // Add the new post to the list without fetching all posts again
    post.id = docRef.id;
    posts.value = [post, ...posts.value];
    
    // Clear cache since we've added a new post
    postsCache.clear();
    
    // Reset form fields
    newPost.value = { 
      title: "", 
      body: "", 
      imageUrl: "",
      location: { lat: 40.416775, lng: -3.70379 } // Reset to default location (Madrid)
    };
    imageFile.value = null;
    showLocationPicker.value = false; // Hide location picker after posting
    
    // Update filter lists with the new post
    updateFilterLists(posts.value);
    
    // Reset cost details
    updateCostDetails();
    
  } catch (err) {
    console.error("Error al agregar post:", err.message);
    error.value = "Error al agregar el post.";
  } finally {
    loading.value = false;
  }
}

/*
   Function: generateTags
   Description: Optimized tag generation.
*/
function generateTags(title, body) {
  // Use Set for automatic deduplication
  const words = new Set([
    ...title.toLowerCase().split(/\s+/),
    ...body.toLowerCase().split(/\s+/)
  ]);
  
  // Filter words efficiently
  return Array.from(words)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 20); // Limit to 20 tags
}

// Common Spanish stop words to exclude from tags
const stopWords = new Set([
  "para", "como", "pero", "esto", "porque", "cuando", "desde", "hasta", 
  "entre", "sobre", "contra", "hacia", "segun", "durante", "mediante"
]);

/*
   Function: onFileSelected
   Description: Handles file selection with validation.
*/
function onFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    error.value = "Tipo de archivo no válido. Use JPG, PNG, GIF o WEBP.";
    return;
  }
  
  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    error.value = "La imagen es demasiado grande. Máximo 5MB.";
    return;
  }
  
  imageFile.value = file;
  error.value = ""; // Clear error if valid
  updateCostDetails(); // Update cost details when image is selected
}

/*
   Function: deletePost
   Description: Deletes a post with permission check and optimistic UI update.
*/
async function deletePost(postId) {
  try {
    const postRef = doc(db, "posts", postId);
    const postDoc = await getDoc(postRef);

    if (postDoc.exists() && postDoc.data().userId === auth.currentUser.uid) {
      // Optimistic UI update - remove post from UI immediately
      posts.value = posts.value.filter(post => post.id !== postId);
      
      // Delete from Firestore
      await deleteDoc(postRef);
      
      // Clear cache since we've deleted a post
      postsCache.clear();
    } else {
      error.value = "No tienes permiso para eliminar este post.";
    }
  } catch (err) {
    console.error("Error al eliminar el post:", err.message);
    error.value = "Error al eliminar el post.";
    
    // Revert optimistic update on error by reloading posts
    await descargarPosts();
  }
}

/*
   Function: toggleCompleted
   Description: Marks a post as completed with optimistic UI update.
*/
async function toggleCompleted(postId) {
  try {
    const postRef = doc(db, "posts", postId);
    const postDoc = await getDoc(postRef);

    if (postDoc.exists() && postDoc.data().userId === auth.currentUser.uid) {
      // Optimistic UI update
      const postIndex = posts.value.findIndex((post) => post.id === postId);
      if (postIndex !== -1) {
        posts.value[postIndex].completed = true;
        
        // Force component update for the specific post
        const updatedPosts = [...posts.value];
        posts.value = updatedPosts;
      }
      
      // Update in Firestore
      await updateDoc(postRef, { completed: true });
    } else {
      error.value = "No tienes permiso para completar este post.";
    }
  } catch (err) {
    console.error("Error al actualizar el estado del post:", err.message);
    error.value = "Error al actualizar el estado del post.";
    
    // Revert optimistic update on error
    await descargarPosts();
  }
}

/*
   Function: buscarPosts
   Description: Initiates the fetching of posts with filters.
*/
async function buscarPosts() {
  await descargarPosts();
}

/*
   Function: resetFilters
   Description: Resets all filters at once.
*/
async function resetFilters() {
  filtroFecha.value = "";
  filtroUsuario.value = "";
  filtroTitulo.value = "";
  filtroLikes.value = "";
  buscarTexto.value = "";
  await descargarPosts();
}

/*
   Function: toggleLike
   Description: Toggles the like status for a post with optimistic UI update.
*/
async function toggleLike(postId) {
  if (!auth.currentUser) {
    error.value = "Debes iniciar sesión para dar like.";
    return;
  }
  
  try {
    const postRef = doc(db, "posts", postId);
    const postDoc = await getDoc(postRef);

    if (postDoc.exists()) {
      const currentLikes = postDoc.data().likes || 0;
      const likedBy = postDoc.data().likedBy || [];
      const uid = auth.currentUser.uid;
      const hasLiked = likedBy.includes(uid);
      
      // Apply optimistic update to UI
      const postIndex = posts.value.findIndex((post) => post.id === postId);
      if (postIndex !== -1) {
        if (hasLiked) {
          // Unlike
          posts.value[postIndex].likes = Math.max(0, currentLikes - 1);
          posts.value[postIndex].likedBy = likedBy.filter(id => id !== uid);
        } else {
          // Like
          posts.value[postIndex].likes = currentLikes + 1;
          posts.value[postIndex].likedBy = [...likedBy, uid];
        }
        
        // Force component update
        const updatedPosts = [...posts.value];
        posts.value = updatedPosts;
      }

      // Update in Firestore
      const updates = hasLiked 
        ? { 
            likes: Math.max(0, currentLikes - 1), 
            likedBy: likedBy.filter(id => id !== uid) 
          }
        : { 
            likes: currentLikes + 1, 
            likedBy: [...likedBy, uid] 
          };
          
      await updateDoc(postRef, updates);
      
      // Clear relevant cache entries
      if (filtroLikes.value) {
        postsCache.clear();
      }
    }
  } catch (err) {
    console.error("Error al actualizar los likes del post:", err.message);
    error.value = "Error al actualizar los likes del post.";
    
    // Revert optimistic update on error
    await descargarPosts();
  }
}

/*
   Function: showPostDetails
   Description: Muestra el diálogo con los detalles del post seleccionado.
*/
function showPostDetails(post) {
  selectedPost.value = post;
  dialogOpen.value = true;
}

/*
   Function: showAuthorDetails
   Description: Muestra el diálogo con los detalles del autor seleccionado.
*/
function showAuthorDetails(post) {
  if (post && post.avatar && post.author && post.email) {
    selectedAuthor.value = {
      name: post.author,
      email: post.email,
      avatar: post.avatar,
      userId: post.userId
    };
    authorDialogOpen.value = true;
  }
}

// Watch for changes in form fields to update costs
watch(() => newPost.value.body, (newVal) => {
  updateCostDetails();
});

watch(() => newPost.value.imageUrl, (newVal) => {
  updateCostDetails();
});

// Reset error message after a delay
let errorTimeout;
watch(error, (newError) => {
  if (newError) {
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => {
      error.value = "";
    }, 5000);
  }
});

// Setup and cleanup
onMounted(() => {
  descargarPosts();
  loadUserCredits(); // Load user credits on mount
  
  // Add ResizeObserver to handle map resizing properly
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(entries => {
      // Trigger map resize on layout changes
      if (showMap.value) {
        nextTick(() => {
          window.dispatchEvent(new Event('resize'));
        });
      }
    });
    
    // Observe the main element
    const mainElement = document.querySelector('.v-main');
    if (mainElement) {
      resizeObserver.observe(mainElement);
    }
  }
});

onBeforeUnmount(() => {
  // Clean up any pending timeouts
  clearTimeout(searchTimeout);
  clearTimeout(errorTimeout);
});

// Helper function for deshacerFiltro
async function deshacerFiltro(filterRef) {
  filterRef.value = "";
  await buscarPosts();
}

// Función para mostrar la pantalla de créditos
function showCredits() {
  window.dispatchEvent(new Event('show-credits'));
}

// Single function for all filter resets
const deshacerFiltro1 = () => deshacerFiltro(filtroFecha);
const deshacerFiltro2 = () => deshacerFiltro(filtroUsuario);
const deshacerFiltro3 = () => deshacerFiltro(filtroLikes);
const deshacerFiltro4 = () => deshacerFiltro(filtroTitulo);

// Actualizar el costo según las características del post
function updateCostDetails() {
  // Resetear costos adicionales
  costDetails.value.location = 0;
  costDetails.value.image = 0;
  costDetails.value.longText = 0;
  
  // Verificar si se está añadiendo una ubicación
  if (newPost.value.location && (newPost.value.location.lat !== 40.416775 || newPost.value.location.lng !== -3.70379)) {
    costDetails.value.location = 10; // Costo por añadir ubicación
  }
  
  // Verificar si se está añadiendo una imagen
  if (newPost.value.imageUrl || imageFile.value) {
    costDetails.value.image = 8; // Costo por añadir imagen
  }
  
  // Verificar si el texto es largo (>280 caracteres)
  if (newPost.value.body && newPost.value.body.length > 280) {
    costDetails.value.longText = 3; // Costo por texto largo
  }
}

// Cargar créditos del usuario
async function loadUserCredits() {
  if (!auth.currentUser) return;
  
  try {
    const userCreditsData = await getUserCredits(auth.currentUser.uid);
    userCredits.value = userCreditsData.credits || 0;
  } catch (err) {
    console.error("Error al cargar los créditos:", err);
  }
}

// Función para mostrar animación de monedas al crear un post
function showCoinAnimation() {
  const coinContainer = document.querySelector('.coin-animation-container');
  if (!coinContainer) return;
  
  coinContainer.classList.add('show-animation');
  
  // Reiniciar la animación de cada moneda
  const coins = coinContainer.querySelectorAll('.animated-coin');
  coins.forEach(coin => {
    coin.style.animation = 'none';
    void coin.offsetWidth; // Truco para forzar un reflow
    coin.style.animation = null;
  });
  
  // Ocultar después de que termine la animación
  setTimeout(() => {
    coinContainer.classList.remove('show-animation');
  }, 2000);
}
</script>

<template>
  <v-container>
    <!-- First Row: Search field, Search button, and Filters toggle -->
    <v-row>
      <v-col cols="6" md="8">
        <v-text-field 
          v-model="buscarTexto" 
          label="Buscar por Tag" 
          @keyup.enter="buscarPorTag" 
          outlined 
        />
      </v-col>
      <v-col cols="2" md="1">
        <!-- Search Arrow Button -->
        <v-btn icon @click="buscarPorTag" class="search-btn">
          <v-icon>mdi-magnify</v-icon>
        </v-btn>
      </v-col>
      <v-col cols="2" md="1">
        <v-btn @click="toggleDrawer">Filtros</v-btn>
      </v-col>
      <v-col cols="2" md="2">
        <v-btn @click="toggleMap">
          <v-icon left>mdi-map</v-icon>
          {{ showMap ? 'Ocultar Mapa' : 'Mostrar Mapa' }}
        </v-btn>
      </v-col>
    </v-row>

    <!-- Map View of All Posts -->
    <v-row v-if="showMap">
      <v-col cols="12">
        <v-card class="map-card">
          <v-card-title class="map-title">
            <v-icon left>mdi-map-marker</v-icon>
            Ubicaciones de los Posts
          </v-card-title>
          <v-card-text>
            <GoogleMap :posts="posts" :height="'400px'" :zoom="6" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Drawer for additional filters -->
    <v-row v-if="mostrarDrawer">
      <v-col cols="12">
        <v-btn @click="toggleFiltroFecha">Filtrar por Fecha</v-btn>
        <v-btn @click="toggleFiltroUsuarios">Filtrar por Usuario</v-btn>
        <v-btn @click="toggleFiltroTitulos">Filtrar por Título</v-btn>
        <v-btn @click="toggleFiltroLikes">Filtrar por Likes</v-btn>
      </v-col>
    </v-row>

    <!-- Date Filter -->
    <v-row v-if="mostrarFecha">
      <v-col cols="8">
        <v-text-field 
          v-model="filtroFecha" 
          label="Filtrar por Fecha" 
          type="date" 
          outlined 
        />
      </v-col>
      <v-col cols="4">
        <v-btn @click="buscarPosts">Aplicar Fecha</v-btn>
        <v-btn color="secondary" @click="deshacerFiltro1">Deshacer Filtro</v-btn>
      </v-col>
    </v-row>

    <!-- User Filter -->
    <v-row v-if="mostrarUsuarios">
      <v-col cols="12">
        <v-select 
          v-model="filtroUsuario" 
          :items="usuarios" 
          label="Seleccionar Usuario" 
          outlined 
          @update:modelValue="descargarPosts" 
        />
        <v-btn color="secondary" @click="deshacerFiltro2">Deshacer Filtro</v-btn>
      </v-col>
    </v-row>

    <!-- Title Filter -->
    <v-row v-if="mostrarTitulos">
      <v-col cols="12">
        <v-select 
          v-model="filtroTitulo" 
          :items="titulos" 
          label="Seleccionar Título" 
          outlined 
          @update:modelValue="descargarPosts" 
        />
        <v-btn color="secondary" @click="deshacerFiltro4">Deshacer Filtro</v-btn>
      </v-col>
    </v-row>

    <!-- Likes Filter -->
    <v-row v-if="mostrarLikes">
      <v-col cols="6">
        <v-text-field 
          v-model="filtroLikes" 
          label="Filtrar por Likes" 
          type="number" 
          outlined 
          @update:modelValue="descargarPosts" 
        />
      </v-col>
      <v-col cols="6">
        <v-select 
          v-model="filtroLikesCondicion" 
          :items="['mayor', 'menor', 'igual']" 
          label="Condición" 
          outlined 
          @update:modelValue="descargarPosts" 
        />
      </v-col>
      <v-col cols="12">
        <v-btn color="secondary" @click="deshacerFiltro3">Deshacer Filtro</v-btn>
      </v-col>
    </v-row>

    <!-- Posts List -->
    <v-row>
      <v-col cols="12">
        <h1 class="text-center">Lista de Posts</h1>
        <div class="logo">
          <img src="https://imgur.com/pte08et.png" alt="Logo" />
        </div>
      </v-col>
    </v-row>

    <!-- Error Message -->
    <v-row v-if="error">
      <v-col cols="12">
        <p class="error">{{ error }}</p>
      </v-col>
    </v-row>

    <!-- Posts Cards -->
    <v-row>
      <v-col cols="12" md="6" lg="4" v-for="post in posts" :key="post.id">
        <v-card class="mx-auto post-card" outlined>
          <v-card-title :class="{ 'completed': post.completed }">
            {{ post.title }}
            <v-icon v-if="post.completed" color="green">mdi-shield-check</v-icon>
          </v-card-title>
          <v-card-subtitle>
            <v-avatar size="24" class="mr-2">
              <v-img :src="post.avatar" alt="Avatar del autor" />
            </v-avatar>
            {{ post.author || "Anónimo" }}
          </v-card-subtitle>
          <v-card-text>
            <p :class="{ 'completed': post.completed }">{{ post.body }}</p>
            
            <!-- Fecha de publicación y tags -->
            <p class="date">Publicado el: {{ post.createdAt.toDate().toLocaleString() }}</p>
            <v-chip-group>
              <v-chip v-for="tag in post.tags" :key="tag">{{ tag }}</v-chip>
            </v-chip-group>
            
            <!-- Indicador de imagen o ubicación disponibles -->
            <div class="details-indicators" v-if="post.imageUrl || (post.location && post.location.lat && post.location.lng)">
              <v-icon small color="gold" class="mr-1" v-if="post.imageUrl">mdi-image</v-icon>
              <v-icon small color="gold" class="mr-1" v-if="post.location && post.location.lat && post.location.lng">mdi-map-marker</v-icon>
            </div>
            
            <v-checkbox
              :value="post.completed"
              @change="toggleCompleted(post.id)"
              label="Completado"
              :disabled="post.completed || post.userId !== auth.currentUser.uid"
            />
          </v-card-text>
          <v-card-actions>
            <div class="bin-button" @click="deletePost(post.id)" v-if="post.userId === auth.currentUser.uid">
              <v-icon class="bin-bottom">mdi-trash-can-outline</v-icon>
              <v-icon class="garbage">mdi-delete-circle</v-icon>
            </div>
            
            <v-spacer></v-spacer>
            
            <!-- Botón Ver Detalles -->
            <v-btn 
              color="accent" 
              class="details-btn"
              @click="showPostDetails(post)"
            >
              <v-icon left>mdi-information-outline</v-icon>
              Ver Detalles
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo para mostrar detalles del post -->
    <v-dialog
      v-model="dialogOpen"
      max-width="700px"
      scrollable
    >
      <v-card v-if="selectedPost" class="post-details-dialog">
        <v-card-title class="dialog-title">
          <span :class="{ 'completed': selectedPost.completed }">{{ selectedPost.title }}</span>
          <v-icon v-if="selectedPost.completed" color="green" class="ml-2">mdi-shield-check</v-icon>
        </v-card-title>
        
        <v-card-subtitle class="dialog-subtitle">
          <div class="author-info" @click="showAuthorDetails(selectedPost)">
            <v-avatar size="28" class="mr-2">
              <v-img :src="selectedPost.avatar" alt="Avatar del autor" />
            </v-avatar>
            <span class="author-name">{{ selectedPost.author || "Anónimo" }}</span>
            <v-icon small class="ml-1">mdi-information-outline</v-icon>
          </div>
        </v-card-subtitle>
        
        <v-divider></v-divider>
        
        <v-card-text class="dialog-content">
          <!-- Contenido del post -->
          <p class="post-body" :class="{ 'completed': selectedPost.completed }">{{ selectedPost.body }}</p>
          
          <!-- Imagen del post -->
          <div v-if="selectedPost.imageUrl" class="image-container">
            <h3 class="section-title">
              <v-icon>mdi-image</v-icon>
              Imagen
            </h3>
            <v-img 
              :src="selectedPost.imageUrl" 
              alt="Imagen del post" 
              max-height="400"
              contain
              class="post-details-image"
            />
          </div>
          
          <!-- Mapa de ubicación -->
          <div v-if="selectedPost.location && selectedPost.location.lat && selectedPost.location.lng" class="map-container">
            <h3 class="section-title">
              <v-icon>mdi-map-marker</v-icon>
              Ubicación
            </h3>
            <GoogleMap 
              :posts="[selectedPost]" 
              :height="'300px'" 
              :zoom="12" 
            />
            <p class="location-details">
              Coordenadas: {{ selectedPost.location.lat.toFixed(6) }}, {{ selectedPost.location.lng.toFixed(6) }}
            </p>
          </div>
          
          <!-- Metadatos adicionales -->
          <div class="post-metadata">
            <h3 class="section-title">
              <v-icon>mdi-information-outline</v-icon>
              Información adicional
            </h3>
            <p class="date">Publicado el: {{ selectedPost.createdAt.toDate().toLocaleString() }}</p>
            <div class="tags-container">
              <span class="tags-label">Tags:</span>
              <v-chip-group>
                <v-chip v-for="tag in selectedPost.tags" :key="tag" small>{{ tag }}</v-chip>
              </v-chip-group>
            </div>
            <p v-if="selectedPost.likes">
              <v-icon small color="red">mdi-heart</v-icon>
              {{ selectedPost.likes }} likes
            </p>
          </div>
        </v-card-text>
        
        <v-divider></v-divider>
        
        <v-card-actions class="dialog-actions">
          <v-btn 
            color="primary" 
            @click="dialogOpen = false"
          >
            Cerrar
          </v-btn>
          
          <!-- Acciones adicionales para el autor -->
          <v-spacer></v-spacer>
          
          <v-btn 
            v-if="selectedPost.userId === auth.currentUser?.uid && !selectedPost.completed"
            color="success" 
            @click="toggleCompleted(selectedPost.id); dialogOpen = false"
          >
            <v-icon left>mdi-check</v-icon>
            Marcar como Completado
          </v-btn>
          
          <v-btn 
            v-if="selectedPost.userId === auth.currentUser?.uid"
            color="error" 
            @click="deletePost(selectedPost.id); dialogOpen = false"
          >
            <v-icon left>mdi-delete</v-icon>
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo para mostrar detalles del autor -->
    <v-dialog
      v-model="authorDialogOpen"
      max-width="400px"
    >
      <v-card v-if="selectedAuthor" class="author-details-dialog">
        <v-card-title class="author-dialog-title">
          Perfil de Usuario
        </v-card-title>
        
        <v-card-text class="author-dialog-content">
          <div class="author-avatar-container">
            <v-avatar size="120" class="mb-3">
              <v-img :src="selectedAuthor.avatar" alt="Avatar del autor" />
            </v-avatar>
          </div>
          
          <div class="author-info-container">
            <h3 class="author-name-large">
              <v-icon left>mdi-account</v-icon>
              {{ selectedAuthor.name }}
            </h3>
            
            <p class="author-email">
              <v-icon small class="mr-2">mdi-email</v-icon>
              {{ selectedAuthor.email }}
            </p>
          </div>
        </v-card-text>
        
        <v-divider></v-divider>
        
        <v-card-actions class="author-dialog-actions">
          <v-btn 
            color="primary" 
            block
            @click="authorDialogOpen = false"
          >
            Cerrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add New Post Form -->
    <v-row>
      <v-col cols="12">
        <h2 class="text-center">Agregar un nuevo post</h2>
        <form @submit.prevent="addPost">
          <v-text-field label="Título" v-model="newPost.title" outlined required />
          <v-textarea label="Contenido" v-model="newPost.body" outlined required />
          <v-text-field label="URL de la imagen" v-model="newPost.imageUrl" outlined />
          <v-file-input
            label="Subir imagen"
            @change="onFileSelected"
            accept="image/png, image/jpeg"
            outlined
          />
          
          <!-- Location selection section -->
          <v-row>
            <v-col cols="12">
              <v-btn @click="toggleLocationPicker" color="primary" class="mb-4">
                <v-icon left>mdi-map-marker</v-icon>
                {{ showLocationPicker ? 'Ocultar Selector de Ubicación' : 'Seleccionar Ubicación en el Mapa' }}
              </v-btn>
              
              <div v-if="showLocationPicker" class="location-picker-container mb-4">
                <p class="mb-2">Haz clic en el mapa para seleccionar la ubicación de tu post:</p>
                <GoogleMap 
                  :posts="[]"
                  :clickable="true"
                  :onLocationSelected="handleLocationSelected"
                  :height="'300px'"
                  :zoom="5"
                />
                
                <div v-if="newPost.location" class="selected-location mt-2">
                  <v-icon color="primary" small class="mr-2">mdi-map-marker-check</v-icon>
                  Ubicación seleccionada: {{ newPost.location.lat.toFixed(6) }}, {{ newPost.location.lng.toFixed(6) }}
                </div>
              </div>
            </v-col>
          </v-row>
          
          <!-- Cost details and user credits -->
          <v-row>
            <v-col cols="12">
              <v-card class="credit-info-card brown-card elevation-2">
                <v-card-title class="credit-info-title">
                  <v-icon color="amber" class="mr-2">mdi-cash-register</v-icon>
                  Costos de Publicación
                </v-card-title>
                
                <v-card-text>
                  <div class="credit-balance">
                    <div>
                      <v-icon color="amber" size="large">mdi-coins</v-icon>
                    </div>
                    <div class="balance-container">
                      <div class="balance-label">Tus créditos disponibles</div>
                      <div class="balance-amount" :class="{'low-balance': userCredits < totalCost}">{{ userCredits }}</div>
                    </div>
                  </div>
                  
                  <div class="cost-list">
                    <div class="cost-item">
                      <div class="cost-item-left">
                        <v-icon color="amber" class="mr-2">mdi-note-plus</v-icon>
                        <div>
                          <div class="cost-item-title">Crear post (base)</div>
                          <div class="cost-item-subtitle">Costo fijo por crear cualquier post</div>
                        </div>
                      </div>
                      <div class="cost-item-amount">
                        <v-chip color="amber-darken-2" text-color="white">{{ costDetails.base }} créditos</v-chip>
                      </div>
                    </div>
                    
                    <div class="cost-item" :class="{'active-cost': costDetails.location > 0}">
                      <div class="cost-item-left">
                        <v-icon :color="costDetails.location > 0 ? 'amber' : 'grey'">mdi-map-marker</v-icon>
                        <div>
                          <div class="cost-item-title">Añadir ubicación</div>
                        </div>
                      </div>
                      <div class="cost-item-amount">
                        <v-chip v-if="costDetails.location > 0" color="amber-darken-2" text-color="white">
                          +{{ costDetails.location }} créditos
                        </v-chip>
                        <v-chip v-else color="grey" text-color="white">+0 créditos</v-chip>
                      </div>
                    </div>
                    
                    <div class="cost-item" :class="{'active-cost': costDetails.image > 0}">
                      <div class="cost-item-left">
                        <v-icon :color="costDetails.image > 0 ? 'amber' : 'grey'">mdi-image</v-icon>
                        <div>
                          <div class="cost-item-title">Añadir imagen</div>
                        </div>
                      </div>
                      <div class="cost-item-amount">
                        <v-chip v-if="costDetails.image > 0" color="amber-darken-2" text-color="white">
                          +{{ costDetails.image }} créditos
                        </v-chip>
                        <v-chip v-else color="grey" text-color="white">+0 créditos</v-chip>
                      </div>
                    </div>
                    
                    <div class="cost-item" :class="{'active-cost': costDetails.longText > 0}">
                      <div class="cost-item-left">
                        <v-icon :color="costDetails.longText > 0 ? 'amber' : 'grey'">mdi-text-long</v-icon>
                        <div>
                          <div class="cost-item-title">Texto largo (>280 caracteres)</div>
                          <div v-if="costDetails.longText > 0" class="cost-item-subtitle">
                            Actualmente: {{ newPost.body ? newPost.body.length : 0 }} caracteres
                          </div>
                        </div>
                      </div>
                      <div class="cost-item-amount">
                        <v-chip v-if="costDetails.longText > 0" color="amber-darken-2" text-color="white">
                          +{{ costDetails.longText }} créditos
                        </v-chip>
                        <v-chip v-else color="grey" text-color="white">+0 créditos</v-chip>
                      </div>
                    </div>
                  </div>
                  
                  <v-divider class="my-4"></v-divider>
                  
                  <div class="cost-total">
                    <div class="cost-total-label">Costo total:</div>
                    <div class="cost-total-amount">
                      <v-chip size="large" :color="userCredits >= totalCost ? 'success' : 'error'" text-color="white">
                        <v-icon start>{{ userCredits >= totalCost ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon>
                        {{ totalCost }} créditos
                      </v-chip>
                    </div>
                  </div>
                  
                  <v-alert
                    v-if="userCredits < totalCost"
                    type="error"
                    variant="tonal"
                    icon="mdi-cash-remove"
                    class="mt-4"
                    density="compact"
                  >
                    <strong>¡Créditos insuficientes!</strong> Te faltan {{ totalCost - userCredits }} créditos para publicar.
                  </v-alert>
                  
                  <v-btn
                    v-if="userCredits < totalCost"
                    color="amber-darken-2"
                    block
                    class="mt-4"
                    prepend-icon="mdi-cash-plus"
                    @click="showCredits"
                  >
                    Comprar Créditos
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
          
          <div class="submit-section">
            <v-row>
              <v-col cols="12" md="6" class="d-flex align-center">
                <div class="coin-cost-display">
                  <div class="coin-stack">
                    
                  </div>
                  <div class="cost-indicator">
                    <span class="cost-value">{{ totalCost }}</span>
                    <span class="cost-label">créditos</span>
                  </div>
                </div>
              </v-col>
              <v-col cols="12" md="6">
                <v-btn 
                  color="primary" 
                  type="submit" 
                  block 
                  class="add-post-btn"
                  :disabled="userCredits < totalCost || !newPost.title || !newPost.body"
                >
                  <v-icon start>mdi-plus-circle</v-icon>
                  Crear Post
                </v-btn>
                <div class="validation-hints" v-if="!newPost.title || !newPost.body">
                  <v-icon small color="orange" v-if="!newPost.title">mdi-alert-circle</v-icon>
                  <span class="validation-text" v-if="!newPost.title">El título es obligatorio</span>
                  
                  <v-icon small color="orange" v-if="!newPost.body" class="ml-2">mdi-alert-circle</v-icon>
                  <span class="validation-text" v-if="!newPost.body">El contenido es obligatorio</span>
                </div>
              </v-col>
            </v-row>
          </div>
        </form>
      </v-col>
    </v-row>
    
    <!-- Insufficient credits dialog -->
    <v-dialog v-model="insufficientCreditsDialog" max-width="450px">
      <v-card class="credits-dialog">
        <v-card-title class="credits-dialog-title">
          <v-icon left color="amber" large>mdi-coins</v-icon>
          Créditos insuficientes
        </v-card-title>
        
        <v-card-text class="credits-dialog-content">
          <p>No tienes suficientes créditos para publicar este post.</p>
          
          <div class="credits-summary">
            <div class="credits-row">
              <span>Tu saldo actual:</span>
              <span class="credit-value">{{ userCredits }} créditos</span>
            </div>
            <div class="credits-row">
              <span>Costo de este post:</span>
              <span class="credit-value">{{ totalCost }} créditos</span>
            </div>
            <div class="credits-row credits-missing">
              <span>Te faltan:</span>
              <span class="credit-value">{{ totalCost - userCredits }} créditos</span>
            </div>
          </div>
          
          <div class="credits-options-title">
            <v-icon left color="amber">mdi-shopping</v-icon>
            Opciones para conseguir créditos
          </div>
        </v-card-text>
        
        <v-card-actions class="credits-dialog-actions">
          <v-btn 
            color="primary" 
            @click="insufficientCreditsDialog = false; showCredits()"
            block
            class="buy-credits-btn"
          >
            <v-icon left>mdi-cash</v-icon>
            Comprar Créditos
          </v-btn>
          
          <v-btn 
            text
            @click="insufficientCreditsDialog = false"
            block
          >
            Cerrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Animación de monedas -->
    <div class="coin-animation-container">
      <img v-for="i in 10" :key="i" 
           src="/assets/conejoKCD2.png" 
           class="animated-coin" 
           :class="`coin-${i}`"
           alt="Moneda animada" />
    </div>
  </v-container>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap'); /* Medieval-style font */
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap'); /* Additional medieval font */

.error {
  color: red;
  font-weight: bold;
  text-align: center;
}

.date {
  font-size: 0.8rem;
  color: gray;
}

.logo {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.logo img {
  height: 340px; /* Increased height */
}

.completed {
  text-decoration: line-through;
  color: gray;
}

.v-card {
  background-color: #4a2c2a !important;
  color: #fff !important;
  font-family: 'Cinzel', serif;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.v-btn {
  background-color: #6b4f4a !important;
  color: #fff !important;
  font-family: 'MedievalSharp', serif;
}

.v-btn:hover {
  background-color: #5a2e0e !important;
}

.v-card-title,
.v-card-text {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  word-wrap: break-word;
}

.v-card-subtitle {
  font-family: 'MedievalSharp', serif;
}

.post-card {
  min-height: unset;
  max-height: unset;
  height: auto;
}

.post-image {
  width: 100%;
  height: auto;
  object-fit: contain;
}

.transparent-app-bar {
  background-color: transparent !important;
  box-shadow: none !important;
}

.search-btn,
.filter-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  min-width: 50px !important;
  min-height: 50px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #6b4f4a !important;
  color: white !important;
  border: 2px solid rgb(255, 201, 201);
  transition: background-color 0.3s ease-in-out, transform 0.2s;
  overflow: hidden;
}

.search-btn:hover,
.filter-btn:hover {
  background-color: #5a2e0e !important;
}

.search-btn:active,
.filter-btn:active {
  transform: scale(0.9);
}

.search-btn v-icon,
.filter-btn v-icon {
  font-size: 24px !important;
  line-height: 1 !important;
}

#f-usuario {
  margin-left: 10px;
}

.bin-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 55px;
  height: 55px;
  border: 2px solid rgb(255, 201, 201);
  transition-duration: 0.3s;
  position: relative;
  overflow: hidden;
}

.bin-bottom {
  width: 15px;
  z-index: 2;
}

.bin-top {
  width: 17px;
  transform-origin: right;
  transition-duration: 0.3s;
  z-index: 2;
}

.bin-button:hover .bin-top {
  transform: rotate(45deg);
}

.bin-button:hover {
  background-color: rgb(255, 0, 0);
}

.bin-button:active {
  transform: scale(0.9);
}

.garbage {
  position: absolute;
  width: 14px;
  height: auto;
  z-index: 1;
  opacity: 0;
  transition: all 0.3s;
}

.bin-button:hover .garbage {
  animation: throw 0.4s linear;
}

@keyframes throw {
  from {
    transform: translate(-400%, -700%);
    opacity: 0;
  }
  to {
    transform: translate(0%, 0%);
    opacity: 1;
  }
}

/* Map styles */
.map-card {
  margin-bottom: 20px;
  overflow: hidden;
  border: 3px solid #6b4f4a;
  border-radius: 10px;
}

.map-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.5rem;
  padding: 12px;
}

.location-mini-map {
  margin: 15px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #6b4f4a;
}

.location-text {
  text-align: center;
  padding: 8px;
  background-color: rgba(107, 79, 74, 0.7);
  margin: 0;
  font-size: 0.9rem;
  font-family: 'Cinzel', serif;
}

.location-picker-container {
  border: 2px solid #6b4f4a;
  border-radius: 8px;
  padding: 15px;
  background-color: rgba(74, 44, 42, 0.7);
}

.selected-location {
  background-color: rgba(107, 79, 74, 0.7);
  padding: 10px;
  border-radius: 5px;
  margin-top: 10px;
  font-family: 'Cinzel', serif;
  text-align: center;
}

/* Estilos para el diálogo de detalles */
.post-details-dialog {
  background-color: #4a2c2a !important;
  border: 3px solid #8b4513;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.dialog-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.8rem !important;
  background-color: #3a1c1a;
  padding: 16px 20px !important;
  color: #f9ebd7;
  display: flex;
  align-items: center;
}

.dialog-subtitle {
  font-family: 'Cinzel', serif;
  font-size: 1.1rem;
  padding: 10px 20px !important;
  background-color: #471f1d;
}

.dialog-content {
  padding: 20px !important;
  max-height: 70vh;
  overflow-y: auto;
}

.section-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.4rem;
  margin: 20px 0 10px;
  color: #f9ebd7;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 8px;
}

.post-body {
  font-size: 1.1rem;
  line-height: 1.5;
  margin-bottom: 20px;
  white-space: pre-line;
}

.image-container {
  margin: 20px 0;
}

.post-details-image {
  border: 2px solid #8b4513;
  border-radius: 5px;
  overflow: hidden;
  margin-top: 10px;
}

.map-container {
  margin: 20px 0;
}

.location-details {
  background-color: rgba(107, 79, 74, 0.7);
  padding: 10px;
  border-radius: 5px;
  margin-top: 8px;
  font-family: 'Cinzel', serif;
  text-align: center;
}

.post-metadata {
  margin: 20px 0;
  padding: 15px;
  background-color: rgba(74, 44, 42, 0.7);
  border-radius: 5px;
}

.tags-container {
  margin: 10px 0;
}

.tags-label {
  font-weight: bold;
  margin-right: 10px;
}

.dialog-actions {
  background-color: #3a1c1a;
  padding: 10px 20px !important;
}

/* Estilos para el botón Ver Detalles */
.details-btn {
  background-color: #8a6e57 !important;
  color: #f9ebd7 !important;
  font-family: 'MedievalSharp', serif;
  border: 1px solid #f9ebd7;
  transition: all 0.3s ease;
}

.details-btn:hover {
  background-color: #c19a6b !important;
  transform: translateY(-2px);
}

.details-indicators {
  display: flex;
  gap: 5px;
  margin-top: 8px;
  color: gold;
  align-items: center;
}

/* Ajustes para el dialogo en móviles */
@media (max-width: 600px) {
  .dialog-title {
    font-size: 1.4rem !important;
  }
  
  .dialog-content {
    padding: 15px !important;
  }
  
  .section-title {
    font-size: 1.2rem;
  }
  
  .post-body {
    font-size: 1rem;
  }
}

/* Estilos para el diálogo del autor */
.author-details-dialog {
  background-color: #4a2c2a !important;
  border: 3px solid #8b4513;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.author-dialog-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.5rem !important;
  background-color: #3a1c1a;
  padding: 16px 20px !important;
  color: #f9ebd7;
  text-align: center;
}

.author-dialog-content {
  padding: 24px !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.author-avatar-container {
  margin-bottom: 16px;
}

.author-avatar-container .v-avatar {
  border: 3px solid #f9ebd7;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.author-info-container {
  width: 100%;
}

.author-name-large {
  font-family: 'Cinzel', serif;
  font-size: 1.4rem;
  margin-bottom: 12px;
  color: #f9ebd7;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.author-email {
  font-family: 'Cinzel', serif;
  font-size: 1rem;
  color: #d0b49f;
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-dialog-actions {
  background-color: #3a1c1a;
  padding: 16px !important;
}

/* Estilo para hacer el nombre del autor clickeable en el diálogo de detalles */
.author-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.author-info:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.author-name {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

/* Estilos para el sistema de créditos */
.credits-info {
  background-color: #3a1c1a;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 10px;
  font-family: 'MedievalSharp', serif;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.credits-info strong {
  color: #f9ebd7;
}

.credits-info .credit-value {
  font-size: 1.2rem;
  color: #ffc107;
  font-weight: bold;
  display: flex;
  align-items: center;
}

.credits-info .credit-value .v-icon {
  margin-right: 5px;
}

.cost-details {
  background-color: rgba(107, 79, 74, 0.7);
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  font-family: 'Cinzel', serif;
}

.cost-details strong {
  color: #f9ebd7;
}

.cost-item {
  display: flex;
  justify-content: space-between;
  margin: 5px 0;
  font-size: 0.9rem;
}

.cost-total {
  margin-top: 8px;
  padding-top: 8px;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cost-total-label {
  font-family: 'MedievalSharp', serif;
  font-size: 1.1rem;
  color: #f9ebd7;
}

.cost-total-amount {
  font-size: 1.2rem;
}

.cost-value {
  color: #ffc107;
}

/* Enhanced credit card styles */
.credit-info-card {
  border: 2px solid #8b4513 !important;
  border-radius: 8px !important;
  overflow: hidden;
  margin-bottom: 24px;
}

.credit-info-title {
  background-color: #3a1c1a !important;
  font-family: 'MedievalSharp', serif !important;
  font-size: 1.3rem !important;
  padding: 16px !important;
  border-bottom: 2px solid #8b4513;
}

.credit-balance {
  display: flex;
  align-items: center;
  background-color: rgba(107, 79, 74, 0.7);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.balance-container {
  margin-left: 16px;
}

.balance-label {
  font-size: 0.9rem;
  color: #d0b49f;
  margin-bottom: 4px;
}

.balance-amount {
  font-family: 'MedievalSharp', serif;
  font-size: 2rem;
  color: #ffc107;
  font-weight: bold;
}

.low-balance {
  color: #ff6f61;
}

/* Estilos para el diálogo de créditos insuficientes */
.credits-dialog {
  background-color: #4a2c2a !important;
  border: 3px solid #8b4513;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.credits-dialog-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.5rem !important;
  background-color: #3a1c1a;
  padding: 16px 20px !important;
  color: #f9ebd7;
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-dialog-content {
  padding: 20px !important;
  font-family: 'Cinzel', serif;
  color: #f9ebd7;
}

.credits-summary {
  background-color: rgba(107, 79, 74, 0.7);
  padding: 12px 16px;
  border-radius: 6px;
  margin: 20px 0;
}

.credits-row {
  display: flex;
  justify-content: space-between;
  margin: 5px 0;
  font-size: 0.9rem;
}

.credits-missing {
  color: #ff6f61;
}

.credits-options-title {
  font-family: 'MedievalSharp', serif;
  font-size: 1.2rem;
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-dialog-actions {
  background-color: #3a1c1a;
  padding: 16px 20px !important;
}

.buy-credits-btn {
  background-color: #8a6e57 !important;
  color: #f9ebd7 !important;
  font-family: 'MedievalSharp', serif;
  border: 1px solid #f9ebd7;
  transition: all 0.3s ease;
}

.buy-credits-btn:hover {
  background-color: #c19a6b !important;
  transform: translateY(-2px);
}

/* Estilos para la visualización de créditos en la barra de navegación */
.credits-display {
  display: flex;
  align-items: center;
  font-family: 'MedievalSharp', serif;
  color: #f9ebd7;
}

.coin-icon {
  width: 24px;
  height: 24px;
}

.credits-amount {
  font-size: 1.2rem;
  font-weight: bold;
}

.credits-btn {
  background-color: #8a6e57 !important;
  color: #f9ebd7 !important;
  border: 1px solid #f9ebd7;
  transition: all 0.3s ease;
}

.credits-btn:hover {
  background-color: #c19a6b !important;
  transform: translateY(-2px);
}

/* Estilos para la sección de costos dentro del formulario de nuevo post */
.cost-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'MedievalSharp', serif;
  font-size: 1.2rem;
  color: #f9ebd7;
  margin-bottom: 12px;
}

.cost-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.cost-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Cinzel', serif;
  color: #d0b49f;
}

.cost-value {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Cinzel', serif;
  color: #ffc107;
}

.mini-coin {
  width: 16px;
  height: 16px;
}

.cost-disabled .cost-label,
.cost-disabled .cost-value {
  color: rgba(255, 255, 255, 0.5);
}

.cost-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  font-family: 'MedievalSharp', serif;
  font-size: 1.2rem;
  color: #f9ebd7;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin-top: 12px;
}

.cost-total-value {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Cinzel', serif;
  color: #ffc107;
}

.cost-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Cinzel', serif;
  color: #ff6f61;
  margin-top: 12px;
}

/* Estilos para animación de monedas */
.coin-animation-container {
  position: fixed;
  bottom: -100px;
  left: 0;
  width: 100%;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.show-animation {
  opacity: 1;
}

.animated-coin {
  position: absolute;
  width: 40px;
  height: 40px;
  bottom: 0;
  opacity: 0;
  transform: translateY(0) rotate(0deg);
}

@keyframes coinFall {
  0% {
    opacity: 0;
    transform: translateY(0) rotate(0deg);
  }
  10% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-100vh) rotate(720deg);
  }
}

.coin-1 { left: 10%; animation: coinFall 2s ease-out 0.1s; }
.coin-2 { left: 20%; animation: coinFall 1.8s ease-out 0.3s; }
.coin-3 { left: 30%; animation: coinFall 2.2s ease-out 0.2s; }
.coin-4 { left: 40%; animation: coinFall 1.9s ease-out 0.4s; }
.coin-5 { left: 50%; animation: coinFall 2.3s ease-out 0.1s; }
.coin-6 { left: 60%; animation: coinFall 2.1s ease-out 0.5s; }
.coin-7 { left: 70%; animation: coinFall 2.4s ease-out 0.2s; }
.coin-8 { left: 80%; animation: coinFall 1.8s ease-out 0.3s; }
.coin-9 { left: 90%; animation: coinFall 2.2s ease-out 0.4s; }
.coin-10 { left: 95%; animation: coinFall 2s ease-out 0.2s; }

/* Estilos para la visualización del costo con monedas apiladas */
.coin-cost-display {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 10px 0;
}

.coin-stack {
  position: relative;
  width: 60px;
  height: 60px;
}

.stacked-coin {
  position: absolute;
  width: 40px;
  height: 40px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.coin-1 {
  left: 0;
  top: 0;
  z-index: 3;
  transform: rotate(-5deg);
}

.coin-2 {
  left: 10px;
  top: 10px;
  z-index: 2;
  transform: rotate(5deg);
}

.coin-3 {
  left: 20px;
  top: 20px;
  z-index: 1;
  transform: rotate(-8deg);
}

.cost-indicator {
  display: flex;
  flex-direction: column;
}

.cost-value {
  font-family: 'MedievalSharp', serif;
  font-size: 1.8rem;
  color: #ffc107;
  font-weight: bold;
}

.cost-label {
  font-family: 'Cinzel', serif;
  font-size: 0.9rem;
  color: #d0b49f;
}

.add-post-btn {
  font-family: 'MedievalSharp', serif;
  font-size: 1.1rem;
  padding: 12px;
  background-color: #8b4513 !important;
  border: 2px solid #f9ebd7;
  transition: all 0.3s ease;
}

.add-post-btn:hover:not(:disabled) {
  background-color: #a0522d !important;
  transform: translateY(-2px);
}

.validation-hints {
  margin-top: 8px;
  font-size: 0.9rem;
  color: orange;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.validation-text {
  margin: 0 8px 0 4px;
}

/* En la barra de navegación superior */
.credits-display {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background-color: rgba(107, 79, 74, 0.7);
  border-radius: 20px;
  border: 1px solid #8b4513;
}

.coin-icon {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}

.credits-amount {
  font-family: 'MedievalSharp', serif;
  font-size: 1.2rem;
  color: #ffc107;
  font-weight: bold;
  margin: 0 6px;
}

.submit-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 2px solid rgba(139, 69, 19, 0.6);
}

.brown-card {
  background-color: #4a2c2a !important;
  border: 2px solid #8b4513 !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3) !important;
}

.credit-info-title {
  background-color: #3a1c1a !important;
  color: #f9ebd7 !important;
  font-family: 'MedievalSharp', cursive !important;
  padding: 16px !important;
  border-bottom: 2px solid #8b4513 !important;
}

.brown-list {
  background-color: transparent !important;
  color: #f9ebd7 !important;
  padding: 0 !important;
}

.item-title {
  color: #f9ebd7 !important;
  font-family: 'Cinzel', serif !important;
  font-weight: 500 !important;
}

.item-subtitle {
  color: #d0b49f !important;
  font-family: 'Cinzel', serif !important;
  font-size: 0.85rem !important;
  opacity: 0.8 !important;
}
</style>
