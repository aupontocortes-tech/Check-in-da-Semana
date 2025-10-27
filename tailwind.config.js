/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF7A00",
          dark: "#cc6200",
        },
      },
      boxShadow: {
        brand: "0 8px 20px rgba(255, 122, 0, 0.35)",
      },
      fontFamily: {
        poppins: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};