import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bull:  '#22c55e',
        bear:  '#ef4444',
        side:  '#f59e0b',
        panic: '#dc2626',
      },
    },
  },
  plugins: [],
}
export default config
