import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  CircularProgress,
  Container,
  IconButton,
  Modal,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface Lock {
  id: string;
  box: number;
  stickerNumber: string | null;
  stickerShape: "rhombus" | "circle" | null;
  photos: string[];
  needsReview?: boolean;
  [k: string]: unknown;
}

// catalog.json stores Windows-style paths like "Images\\Box 2\\IMG_7799.JPG".
// The server exposes the Images/ folder at /images, so drop the leading
// "Images" segment and normalise slashes.
function imageUrl(photoPath: string): string {
  const rel = photoPath.replace(/\\/g, "/").replace(/^Images\//, "");
  return "/images/" + encodeURI(rel);
}

// Shared styling for the lightbox controls: absolutely positioned on the image,
// white on a translucent dark background so they stay legible over any photo,
// and fading in/out (opacity is set per-control from state).
const ctrlSx = {
  position: "absolute",
  color: "common.white",
  bgcolor: "rgba(0, 0, 0, 0.5)",
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.7)" },
};

export default function App() {
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The open lightbox: the current row's photo URLs plus which one is showing.
  const [preview, setPreview] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    fetch("/api/locks")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Lock[]) => setLocks(data))
      .catch((err) => setError(String(err)));
  }, []);

  const closePreview = () => setPreview(null);
  // Move between the row's photos, wrapping around.
  const step = (delta: number) =>
    setPreview((p) =>
      p ? { ...p, index: (p.index + delta + p.urls.length) % p.urls.length } : p,
    );

  // Left/right arrow keys navigate while the lightbox is open (Esc closes via MUI).
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview !== null]);

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            Lock Catalog
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {error && <Alert severity="error">Failed to load catalog: {error}</Alert>}

        {!locks && !error && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {locks && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {locks.length} locks
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small" aria-label="lock catalog">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Box</TableCell>
                    <TableCell>Sticker #</TableCell>
                    <TableCell>Photos</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {locks.map((lock, i) => (
                    <TableRow key={lock.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{lock.box}</TableCell>
                      <TableCell>{lock.stickerNumber ?? "—"}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          {lock.photos.map((p, idx) => (
                            <Box
                              key={p}
                              component="img"
                              src={imageUrl(p)}
                              alt=""
                              loading="lazy"
                              onClick={() =>
                                setPreview({ urls: lock.photos.map(imageUrl), index: idx })
                              }
                              sx={{
                                height: 64,
                                width: 64,
                                objectFit: "cover",
                                borderRadius: 1,
                                display: "block",
                                cursor: "pointer",
                              }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Container>

      <Modal open={!!preview} onClose={closePreview}>
        <Box
          onClick={closePreview}
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preview && (
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{ position: "relative", display: "inline-flex" }}
            >
              <Box
                component="img"
                src={preview.urls[preview.index]}
                alt=""
                sx={{ maxWidth: "80vw", maxHeight: "80vh", display: "block" }}
              />

              <IconButton
                aria-label="close"
                onClick={closePreview}
                sx={{ ...ctrlSx, top: 8, right: 8 }}
              >
                <CloseIcon />
              </IconButton>

              {preview.urls.length > 1 && (
                <>
                  <IconButton
                    aria-label="previous"
                    onClick={(e) => {
                      e.stopPropagation();
                      step(-1);
                    }}
                    sx={{
                      ...ctrlSx,
                      left: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <IconButton
                    aria-label="next"
                    onClick={(e) => {
                      e.stopPropagation();
                      step(1);
                    }}
                    sx={{
                      ...ctrlSx,
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </>
              )}
            </Box>
          )}
        </Box>
      </Modal>
    </>
  );
}
