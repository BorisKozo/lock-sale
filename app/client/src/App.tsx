import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Modal,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

// Keep alphabetically sorted — this list drives the editing dropdown as-is.
const FORMAT_OPTIONS = ["Camlock", "Core", "Euro", "Mortise Round", "Oval", "Padlock", "Swiss"];

interface Lock {
  id: string;
  box: number;
  stickerNumber: string | null;
  stickerShape: "rhombus" | "circle" | "banner" | null;
  photos: string[];
  needsReview?: boolean;
  format?: string | null; // single-select, one of FORMAT_OPTIONS
  brand?: string;
  model?: string;
  brandSource?: string;
  keys?: number | null;
  comments?: string;
  // Internal tracking only — never shown or sent on the published static
  // site (see READ_ONLY below). Defaults to false until marked done.
  readyForSale?: boolean;
  [k: string]: unknown;
}

// The subset of Lock fields editable via the modal.
interface LockEdits {
  format: string | null;
  brand: string;
  model: string;
  keys: string; // kept as string while editing, parsed to number|null on save
  comments: string;
  brandSource: string | null;
  readyForSale: boolean;
}

function toEdits(lock: Lock): LockEdits {
  return {
    format: lock.format ?? null,
    brand: lock.brand ?? "",
    model: lock.model ?? "",
    keys: lock.keys != null ? String(lock.keys) : "",
    comments: lock.comments ?? "",
    brandSource: lock.brandSource ?? null,
    readyForSale: lock.readyForSale === true,
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

// A short reference code buyers can quote back when they want a specific
// lock: <4-digit row No.>-<2-digit box>-<shape letter>. Computed in the UI
// only (not stored in catalog.json) since it's fully derived from fields
// that already live there.
const SHAPE_CODE: Record<string, string> = { circle: "C", rhombus: "R", banner: "B" };
function lockCode(lock: Lock, no: number): string {
  const shapeLetter = (lock.stickerShape && SHAPE_CODE[lock.stickerShape]) || "X";
  return `${String(no).padStart(4, "0")}-${String(lock.box).padStart(2, "0")}-${shapeLetter}`;
}

// Where to fetch the catalog from: the Express API in dev (proxied), or a
// static JSON snapshot baked into the build for the read-only public site
// (see deploy-public.ts). READ_ONLY hides editing when there's no API to save to.
const DATA_URL = import.meta.env.VITE_DATA_URL ?? "/api/locks";
const READ_ONLY = import.meta.env.VITE_READ_ONLY === "true";

// catalog.json stores Windows-style paths like "Images\\Box 2\\IMG_7799.JPG".
// Images are served at "<base>/images/..." — BASE_URL is "/" in dev (proxied
// to the Express server) and "./" in the static public build.
function imageUrl(photoPath: string): string {
  const rel = photoPath.replace(/\\/g, "/").replace(/^Images\//, "");
  return import.meta.env.BASE_URL + "images/" + encodeURI(rel);
}

// Full-resolution original, served only by the local dev server (see
// app/server/src/index.ts) — never available on the published static site,
// so this is only ever called when !READ_ONLY.
function originalImageUrl(photoPath: string): string {
  const rel = photoPath.replace(/\\/g, "/").replace(/^Images\//, "");
  return import.meta.env.BASE_URL + "images-original/" + encodeURI(rel);
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;

// Shared coloring for the lightbox controls: white on a translucent dark
// background so they stay legible over any photo.
const ctrlColorSx = {
  color: "common.white",
  bgcolor: "rgba(0, 0, 0, 0.5)",
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.7)" },
};
// Same, plus absolute positioning — for a single control placed directly on
// the image rather than grouped in an already-positioned Stack (stacking
// this with the Stack's own absolute positioning would collapse every
// button in the group onto the same point instead of laying them out).
const ctrlSx = { ...ctrlColorSx, position: "absolute" as const };

interface LockCardProps {
  lock: Lock;
  no: number;
  onPreview: (photos: string[], index: number) => void;
  onOpenEdit: (lock: Lock) => void;
  onCopyCode: (code: string) => void;
}

// Memoized so typing in the edit dialog (which lives in App's state) doesn't
// re-render all ~300 cards on every keystroke — only cards whose own props
// actually changed (e.g. after a save) re-render.
const LockCard = memo(function LockCard({ lock, no, onPreview, onOpenEdit, onCopyCode }: LockCardProps) {
  const thumb = lock.photos[1] ?? lock.photos[0];
  const code = lockCode(lock, no);
  // Internal-only status, never relevant on the published site — see READ_ONLY.
  const showReady = !READ_ONLY && lock.readyForSale === true;
  return (
    <Card sx={{ display: "flex", flexDirection: "column", ...(showReady && { outline: "2px solid", outlineColor: "success.main" }) }}>
      <Box sx={{ position: "relative" }}>
        <Box
          component="img"
          src={imageUrl(thumb)}
          alt=""
          loading="lazy"
          onClick={() => onPreview(lock.photos, lock.photos.indexOf(thumb))}
          sx={{
            width: "100%",
            aspectRatio: "4 / 3",
            objectFit: "cover",
            display: "block",
            cursor: "pointer",
          }}
        />
        {showReady && (
          <Chip
            label="Ready for sale"
            size="small"
            color="success"
            sx={{ position: "absolute", top: 6, left: 6, fontWeight: 600 }}
          />
        )}
        {lock.photos.length > 1 && (
          <Chip
            icon={<PhotoLibraryIcon sx={{ fontSize: 14 }} />}
            label={lock.photos.length}
            size="small"
            sx={{
              position: "absolute",
              bottom: 8,
              right: 8,
              bgcolor: "rgba(0,0,0,0.55)",
              color: "common.white",
              "& .MuiChip-icon": { color: "common.white" },
            }}
          />
        )}
        {!READ_ONLY && (
          <IconButton
            aria-label="edit"
            size="small"
            onClick={() => onOpenEdit(lock)}
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              bgcolor: "rgba(255,255,255,0.9)",
              "&:hover": { bgcolor: "common.white" },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <CardContent sx={{ flexGrow: 1, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: 0.5 }}>
            {code}
          </Typography>
          <Tooltip title="Copy code">
            <IconButton aria-label="copy lock code" size="small" onClick={() => onCopyCode(code)}>
              <ContentCopyIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.disabled">
            No. {no} · Box {lock.box} · {lock.stickerNumber ? `#${lock.stickerNumber}` : "no sticker"}
            {lock.stickerShape ? ` (${lock.stickerShape})` : ""}
          </Typography>
          {lock.needsReview && <Chip label="Needs review" size="small" color="warning" variant="outlined" />}
        </Stack>

        <Typography variant="h6" sx={{ mb: 0.25 }}>
          {lock.brand || "Unknown brand"}
          {lock.brand && lock.brandSource === "ai-guess" && (
            <Tooltip title="Brand guessed by AI, unverified">
              <AutoAwesomeIcon sx={{ fontSize: 14, ml: 0.5, verticalAlign: "middle", color: "text.secondary" }} />
            </Tooltip>
          )}
        </Typography>
        {lock.model && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {lock.model}
          </Typography>
        )}

        {lock.format && <Chip label={lock.format} size="small" color="secondary" variant="outlined" />}

        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1.25 }}>
          <VpnKeyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2" color="text.secondary">
            {lock.keys == null ? "Keys unknown" : `${lock.keys} ${lock.keys === 1 ? "key" : "keys"}`}
          </Typography>
        </Stack>

        {lock.comments && (
          <Tooltip title={lock.comments}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
                fontStyle: "italic",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {lock.comments}
            </Typography>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
});

export default function App() {
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Local-only view filter; meaningless on the published site since
  // readyForSale never appears there — see READ_ONLY.
  const [hideReady, setHideReady] = useState(false);
  // The open lightbox: the current row's photo paths plus which one is showing.
  const [preview, setPreview] = useState<{ photos: string[]; index: number } | null>(null);
  // Dev-only original-image zoom/pan state; null means "not zoomed" (showing
  // the normal fit-to-screen optimized image). Reset whenever the lightbox
  // closes or moves to a different photo.
  const [zoom, setZoom] = useState<{ scale: number; x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const zoomDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  // The lock currently being edited, plus its in-progress form values.
  const [editing, setEditing] = useState<Lock | null>(null);
  const [edits, setEdits] = useState<LockEdits | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Lock[]) => setLocks(data))
      .catch((err) => setError(String(err)));
  }, []);

  // Pair each lock with its catalog.json row number (1-based) BEFORE filtering,
  // so the number stays stable under search instead of reflecting the filtered
  // position — needed since row numbers are how corrections get referenced.
  const numberedLocks = useMemo(
    () => locks?.map((lock, i) => ({ lock, no: i + 1 })) ?? null,
    [locks],
  );

  const filteredLocks = useMemo(() => {
    if (!numberedLocks) return numberedLocks;
    const q = query.trim().toLowerCase();
    return numberedLocks.filter(
      ({ lock }) =>
        (q === "" || matchesQuery(lock, q)) && (!hideReady || lock.readyForSale !== true),
    );
  }, [numberedLocks, query, hideReady]);

  const closePreview = () => {
    setPreview(null);
    setZoom(null);
    setIsPanning(false);
  };
  // Move between the row's photos, wrapping around; leaving zoom mode since
  // it applies to a specific photo.
  const step = (delta: number) => {
    setZoom(null);
    setIsPanning(false);
    setPreview((p) =>
      p ? { ...p, index: (p.index + delta + p.photos.length) % p.photos.length } : p,
    );
  };

  const startZoom = () => setZoom({ scale: 1, x: 0, y: 0 });
  const zoomBy = (factor: number) =>
    setZoom((z) => (z ? { ...z, scale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.scale * factor)) } : z));
  const onZoomWheel = (e: React.WheelEvent) => {
    if (!zoom) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };
  const onZoomMouseDown = (e: React.MouseEvent) => {
    if (!zoom) return;
    zoomDrag.current = { startX: e.clientX, startY: e.clientY, originX: zoom.x, originY: zoom.y };
    setIsPanning(true);
  };
  const onZoomMouseMove = (e: React.MouseEvent) => {
    if (!zoom || !zoomDrag.current) return;
    const d = zoomDrag.current;
    setZoom({ ...zoom, x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) });
  };
  const endZoomDrag = () => {
    zoomDrag.current = null;
    setIsPanning(false);
  };

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

  const openEdit = useCallback((lock: Lock) => {
    setEditing(lock);
    setEdits(toEdits(lock));
    setSaveError(null);
  }, []);
  const openPreview = useCallback((photos: string[], index: number) => {
    setPreview({ photos, index });
  }, []);
  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, []);
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
      brandSource: edits.brandSource,
      readyForSale: edits.readyForSale,
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
      <AppBar position="static" color="inherit" sx={{ bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <LockOutlinedIcon color="secondary" />
          <Typography variant="h6" component="div" sx={{ color: "primary.main" }}>
            Lock Catalog
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
            {READ_ONLY ? "For sale — browse the collection" : "Editing view"}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load catalog: {error}
          </Alert>
        )}

        {!locks && !error && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {locks && (
          <>
            <TextField
              placeholder="Search box, sticker #, shape, brand, model, comments…"
              size="small"
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ mb: 2, bgcolor: "background.paper", borderRadius: 1 }}
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
            {!READ_ONLY && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={hideReady}
                    onChange={(e) => setHideReady(e.target.checked)}
                  />
                }
                label="Hide locks marked ready for sale"
                sx={{ mb: 1 }}
              />
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              {filteredLocks!.length} of {locks.length} locks
            </Typography>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 2.5,
              }}
            >
              {filteredLocks!.map(({ lock, no }) => (
                <LockCard
                  key={lock.id}
                  lock={lock}
                  no={no}
                  onPreview={openPreview}
                  onOpenEdit={openEdit}
                  onCopyCode={copyCode}
                />
              ))}
            </Box>
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
              {zoom ? (
                <Box
                  onWheel={onZoomWheel}
                  onMouseDown={onZoomMouseDown}
                  onMouseMove={onZoomMouseMove}
                  onMouseUp={endZoomDrag}
                  onMouseLeave={endZoomDrag}
                  sx={{
                    width: "90vw",
                    height: "85vh",
                    overflow: "hidden",
                    cursor: isPanning ? "grabbing" : "grab",
                    bgcolor: "rgba(0,0,0,0.3)",
                  }}
                >
                  <Box
                    component="img"
                    src={originalImageUrl(preview.photos[preview.index])}
                    alt=""
                    draggable={false}
                    sx={{
                      display: "block",
                      maxWidth: "none",
                      width: "90vw",
                      height: "85vh",
                      objectFit: "contain",
                      transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                      transformOrigin: "center center",
                      userSelect: "none",
                    }}
                  />
                </Box>
              ) : (
                <Box
                  component="img"
                  src={imageUrl(preview.photos[preview.index])}
                  alt=""
                  sx={{ maxWidth: "80vw", maxHeight: "80vh", display: "block" }}
                />
              )}

              {!READ_ONLY && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ position: "absolute", top: 8, left: 8 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {zoom ? (
                    <>
                      <IconButton aria-label="zoom in" onClick={() => zoomBy(1.4)} sx={ctrlColorSx}>
                        <ZoomInIcon />
                      </IconButton>
                      <IconButton aria-label="zoom out" onClick={() => zoomBy(1 / 1.4)} sx={ctrlColorSx}>
                        <ZoomOutIcon />
                      </IconButton>
                      <IconButton aria-label="reset zoom" onClick={startZoom} sx={ctrlColorSx}>
                        <RestartAltIcon />
                      </IconButton>
                      <Tooltip title="Back to normal view">
                        <IconButton aria-label="exit zoom" onClick={() => setZoom(null)} sx={ctrlColorSx}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip title="Open original image to zoom &amp; pan">
                      <IconButton aria-label="zoom original image" onClick={startZoom} sx={ctrlColorSx}>
                        <ZoomInIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              )}

              <IconButton
                aria-label="close"
                onClick={closePreview}
                sx={{ ...ctrlSx, top: 8, right: 8 }}
              >
                <CloseIcon />
              </IconButton>

              {preview.photos.length > 1 && (
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
              {edits.brandSource === "ai-guess" && (
                <Tooltip title="Click the × once you've verified this brand/model">
                  <Chip
                    icon={<AutoAwesomeIcon />}
                    label="Guessed by AI"
                    size="small"
                    onDelete={() => setEdits({ ...edits, brandSource: null })}
                    sx={{ alignSelf: "flex-start", mt: -1 }}
                  />
                </Tooltip>
              )}
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={edits.readyForSale}
                    onChange={(e) => setEdits({ ...edits, readyForSale: e.target.checked })}
                  />
                }
                label="Ready for sale (done editing this lock)"
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

      <Snackbar
        open={!!copiedCode}
        autoHideDuration={2000}
        onClose={() => setCopiedCode(null)}
        message={copiedCode ? `Copied code ${copiedCode}` : ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}
