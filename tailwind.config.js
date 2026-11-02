/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { hc: { bg:"#10120f", panel:"#181b17", line:"#2b3028", muted:"#969d90", lime:"#c4f36b" } },
    fontFamily: { sans:["Inter","ui-sans-serif","system-ui","sans-serif"] }
  } },
  plugins: []
};