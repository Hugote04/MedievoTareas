<script setup>
import Principal from "@/components/Principal.vue";
</script>

<template>
  <div id="app">
    <Principal />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap'); /* Medieval-style font */
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap'); /* Additional medieval font */

#app {
  font-family: 'Cinzel', serif; /* Primary medieval-style font */
  background: url('https://imgur.com/H6SBMzF.png') no-repeat center center fixed; /* Background image */
  background-size: cover;
  color: #fff; /* Text color */
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
