import { Box, CircularProgress } from "@mui/material";

export default function SettingsLoading() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#060c18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={32} sx={{ color: "#3b82f6" }} />
    </Box>
  );
}
