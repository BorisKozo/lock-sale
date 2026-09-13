import { createTheme } from "@mui/material/styles";

// A warm-neutral palette that fits a physical-goods sale catalog: deep slate
// for structure, brass for the accent (nods to "locks"), soft off-white
// background so photos and cards stand out instead of sitting on stark white.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2f3b52" },
    secondary: { main: "#b8862f" },
    background: { default: "#f3f2ee", paper: "#ffffff" },
    text: { primary: "#232830", secondary: "#63697a" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", -apple-system, "Segoe UI", Roboto, sans-serif',
    h6: { fontWeight: 700, letterSpacing: 0.2 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: "none", borderBottom: "1px solid rgba(0,0,0,0.08)" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 2px rgba(20,20,30,0.06), 0 1px 8px rgba(20,20,30,0.05)",
          transition: "box-shadow 120ms ease, transform 120ms ease",
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
  },
});
