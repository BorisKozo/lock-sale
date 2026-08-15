import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Modal,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";

// The only format value in use so far; add more here as they come up.
const FORMAT_OPTIONS = ["Euro", "Swiss"];

interface Lock {
  id: string;
  box: number;
  stickerNumber: string | null;
  stickerShape: "rhombus" | "circle" | null;
  photos: string[];
  needsReview?: boolean;
  format?: string | null; // single-select, one of FORMAT_OPTIONS
  brand?: string;
  model?: string;
  keys?: number | null;
  comments?: string;
  [k: string]: unknown;
}

// The subset of Lock fields editable via the modal.
interface LockEdits {
  format: string | null;
  brand: string;
  model: string;
  keys: string; // kept as string while editing, parsed to number|null on save
  comments: string;
}

function toEdits(lock: Lock): LockEdits {
  return {
    format: lock.format ?? null,
    brand: lock.brand ?? "",
    model: lock.model ?? "",
    keys: lock.keys != null ? String(lock.keys) : "",
    comments: lock.comments ?? "",
  };
}

// The fields shown in the table, concatenated for a simple substring search.
const SEARCH_FIELDS: (keyof Lock)[] = [
  "id",
  "box",
  "stickerNumber",
  "stickerShape",
  "format",
  "brand",
  "model",
  "keys",
  "comments",
];

function matchesQuery(lock: Lock, query: string): boolean {
  const haystack = SEARCH_FIELDS.map((f) => String(lock[f] ?? "")).join(" ").toLowerCase();
  return haystack.includes(query);
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
  const [query, setQuery] = useState("");
  // The open lightbox: the current row's photo URLs plus which one is showing.
  const [preview, setPreview] = useState<{ urls: string[]; index: number } | null>(null);
  // The lock currently being edited, plus its in-progress form values.
  const [editing, setEditing] = useState<Lock | null>(null);
  const [edits, setEdits] = useState<LockEdits | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/locks")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Lock[]) => setLocks(data))
      .catch((err) => setError(String(err)));
  }, []);

  const filteredLocks = useMemo(() => {
    if (!locks) return locks;
    const q = query.trim().toLowerCase();
    return q === "" ? locks : locks.filter((l) => matchesQuery(l, q));
  }, [locks, query]);

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

  const openEdit = (lock: Lock) => {
    setEditing(lock);
    setEdits(toEdits(lock));
    setSaveError(null);
  };
  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
    setEdits(null);
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editing || !edits) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      format: edits.format,
      brand: edits.brand,
      model: edits.model,
      keys: edits.keys.trim() === "" ? null : Number(edits.keys),
      comments: edits.comments,
    };
    try {
      const res = await fetch(`/api/locks/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Lock = await res.json();
      setLocks((prev) => prev && prev.map((l) => (l.id === updated.id ? updated : l)));
      setEditing(null);
      setEdits(null);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  };

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
            <TextField
              placeholder="Search all fields…"
              size="small"
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {filteredLocks!.length} of {locks.length} locks
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small" aria-label="lock catalog">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Box</TableCell>
                    <TableCell>Sticker #</TableCell>
                    <TableCell>Shape</TableCell>
                    <TableCell>Format</TableCell>
                    <TableCell>Brand</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Keys</TableCell>
                    <TableCell>Comments</TableCell>
                    <TableCell>Photos</TableCell>
                    <TableCell align="right">Edit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredLocks!.map((lock, i) => (
                    <TableRow key={lock.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{lock.box}</TableCell>
                      <TableCell>{lock.stickerNumber ?? "—"}</TableCell>
                      <TableCell>{lock.stickerShape ?? "—"}</TableCell>
                      <TableCell>
                        {lock.format ? <Chip label={lock.format} size="small" /> : "—"}
                      </TableCell>
                      <TableCell>{lock.brand || "—"}</TableCell>
                      <TableCell>{lock.model || "—"}</TableCell>
                      <TableCell align="right">{lock.keys ?? "—"}</TableCell>
                      <TableCell>{lock.comments || "—"}</TableCell>
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
                      <TableCell align="right">
                        <IconButton aria-label="edit" size="small" onClick={() => openEdit(lock)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
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

      <Dialog open={!!editing} onClose={closeEdit} fullWidth maxWidth="sm">
        <DialogTitle>
          Edit lock {editing?.stickerNumber ? `#${editing.stickerNumber}` : editing?.id}
        </DialogTitle>
        <DialogContent>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to save: {saveError}
            </Alert>
          )}
          {edits && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
              <Autocomplete
                options={FORMAT_OPTIONS}
                value={edits.format}
                onChange={(_e, value) => setEdits({ ...edits, format: value })}
                renderInput={(params) => <TextField {...params} label="Format" />}
              />
              <TextField
                label="Brand"
                value={edits.brand}
                onChange={(e) => setEdits({ ...edits, brand: e.target.value })}
                fullWidth
              />
              <TextField
                label="Model"
                value={edits.model}
                onChange={(e) => setEdits({ ...edits, model: e.target.value })}
                fullWidth
              />
              <TextField
                label="Keys"
                type="number"
                value={edits.keys}
                onChange={(e) => setEdits({ ...edits, keys: e.target.value })}
                fullWidth
              />
              <TextField
                label="Comments"
                value={edits.comments}
                onChange={(e) => setEdits({ ...edits, comments: e.target.value })}
                multiline
                minRows={2}
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveEdit} variant="contained" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
