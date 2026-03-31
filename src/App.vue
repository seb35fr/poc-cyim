<template>
  <router-view />
</template>

<style>
:root {
  --primary: #1e4e66;
  --primary-light: #2a6a8a;
  --accent: #30dd92;
  --accent-hover: #28c580;
  --warning: #ffa600;
  --danger: #e53935;
  --purple: #6f45ff;
  --brand: #c9c934;
  --bg: #f5f6fa;
  --card: #ffffff;
  --text: #414141;
  --text-secondary: #646464;
  --text-muted: #9ca3af;
  --border: #e5e7eb;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  --radius: 12px;
}
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: "Comfortaa", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
