<template>
  <router-view />
</template>

<style>
:root {
  --primary: #0f2d69;
  --primary-light: #1a3f8f;
  --accent: #30dd92;
  --accent-hover: #28c580;
  --warning: #ffa600;
  --danger: #e53935;
  --bg: #f5f6fa;
  --card: #ffffff;
  --text: #1a1a2e;
  --text-secondary: #6b7280;
  --border: #e5e7eb;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  --radius: 12px;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: "Inter", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
</style>
