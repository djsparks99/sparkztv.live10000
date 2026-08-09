import { useState, useEffect } from "react";
import { Calendar, Plus, Trash2, Clock, Music, Save, Check, Image as ImageIcon, Edit3, X, AlertTriangle } from "lucide-react";
import { api, apiErrorMessage, fileUrl } from "@/lib/api";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "EVERYDAY", "WEEKENDS"];

const CATEGORIES = [
  "music",
  "drum and bass",
  "dnb",
  "house",
  "tech",
  "dubstep",
  "reggae",
  "acid",
  "jungle",
  "old skool",
];

export default function ScheduleManager({ channel, onChange }) {
  const [schedule, setSchedule] = useState(channel?.schedules || channel?.schedule || []);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Bottom form state (Add new slot)
  const [day, setDay] = useState("FRI");
  const [time, setTime] = useState("20:00 - 22:00 UTC");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState(channel?.category || "dnb");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Edit Modal State
  const [editItem, setEditItem] = useState(null); // The item currently being edited
  const [editDay, setEditDay] = useState("FRI");
  const [editTime, setEditTime] = useState("20:00 UTC");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGenre, setEditGenre] = useState("dnb");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null); // The item to be deleted
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (channel?.schedules) {
      setSchedule(channel.schedules);
    } else if (channel?.schedule) {
      setSchedule(channel.schedule);
    }
  }, [channel?.schedules, channel?.schedule]);

  const handleImageUpload = async (e, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("thumbnail", file);

    if (isEdit) {
      setUploadingEditImage(true);
    } else {
      setUploadingImage(true);
    }

    try {
      const { data } = await api.post("/channels/mine/schedule-banner", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.thumbnail_url) {
        if (isEdit) {
          setEditImageUrl(data.thumbnail_url);
        } else {
          setImageUrl(data.thumbnail_url);
        }
        toast.success("Schedule banner uploaded successfully!");
      }
    } catch (err) {
      toast.error("Failed to upload banner image.");
    } finally {
      setUploadingEditImage(false);
      setUploadingImage(false);
    }
  };

  // Create (Add) slot handler - immediately saves to backend
  const handleAddNewItem = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a set title or description.");
      return;
    }

    setSaving(true);
    try {
      const newSlot = {
        title: title.trim(),
        description: description.trim(),
        day,
        time: time.trim() || "20:00 UTC",
        genre,
        imageUrl,
        startTime: new Date().toISOString()
      };

      const { data } = await api.post("/channels/mine/schedules", newSlot);
      if (data && data.success) {
        const updatedSchedules = data.schedules || [];
        setSchedule(updatedSchedules);
        
        // Update parent component
        if (onChange) {
          onChange({
            ...channel,
            schedules: updatedSchedules,
            schedule: updatedSchedules[0] || null
          });
        }

        toast.success(`"${title.trim()}" successfully added and published!`);
        
        // Reset form
        setTitle("");
        setDescription("");
        setImageUrl("");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to save new schedule slot.");
    } finally {
      setSaving(false);
    }
  };

  // Open edit modal
  const handleOpenEditModal = (item) => {
    setEditItem(item);
    setEditDay(item.day || "FRI");
    setEditTime(item.time || "20:00 UTC");
    setEditTitle(item.title || "");
    setEditDescription(item.description || "");
    setEditGenre(item.genre || "dnb");
    setEditImageUrl(item.imageUrl || "");
  };

  // Save changes from edit modal
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      toast.error("Please enter a set title.");
      return;
    }

    setSavingEdit(true);
    try {
      const updatedSlot = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        day: editDay,
        time: editTime.trim(),
        genre: editGenre,
        imageUrl: editImageUrl,
        startTime: editItem.startTime || new Date().toISOString()
      };

      const { data } = await api.put(`/channels/mine/schedules/${editItem.id}`, updatedSlot);
      if (data && data.success) {
        const updatedSchedules = data.schedules || [];
        setSchedule(updatedSchedules);

        // Update parent component
        if (onChange) {
          onChange({
            ...channel,
            schedules: updatedSchedules,
            schedule: updatedSchedules[0] || null
          });
        }

        toast.success(`"${editTitle.trim()}" successfully updated on your schedule!`);
        setEditItem(null); // Close modal
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to update schedule slot.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteConfirm = (item) => {
    setDeleteConfirmItem(item);
  };

  // Execute delete operation
  const handleDeleteItem = async () => {
    if (!deleteConfirmItem) return;

    setDeleting(true);
    try {
      const { data } = await api.delete(`/channels/mine/schedules/${deleteConfirmItem.id}`);
      if (data && data.success) {
        const updatedSchedules = data.schedules || [];
        setSchedule(updatedSchedules);

        // Update parent component
        if (onChange) {
          onChange({
            ...channel,
            schedules: updatedSchedules,
            schedule: updatedSchedules[0] || null
          });
        }

        toast.success(`"${deleteConfirmItem.title}" successfully deleted.`);
        setDeleteConfirmItem(null); // Close modal
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to delete schedule slot.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a] p-6 relative" data-testid="streamer-schedule-manager" id="schedule-manager-container">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#e5ff00]" />
          <div className="label-caps mb-0" id="schedule-manager-title">// STREAMER SCHEDULE MANAGER</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-[#e5ff00]/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#e5ff00] border border-[#e5ff00]/20">
            ● LIVE AUTO-SYNC
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {schedule.length} {schedule.length === 1 ? "SET" : "SETS"} PROGRAMMED
          </span>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
        All changes to schedules are saved in real-time and published to your public channel immediately. No manual publish steps required.
      </p>

      {/* Existing Schedule Items */}
      <div className="mt-5 space-y-2.5">
        {schedule.length === 0 ? (
          <div className="border border-dashed border-[#27272a] p-6 text-center" id="empty-schedule-state">
            <Clock className="mx-auto h-5 w-5 text-zinc-600 animate-pulse" />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
              No sets scheduled yet. Add your upcoming broadcast slots below.
            </p>
          </div>
        ) : (
          schedule.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-[#27272a] bg-black p-3 transition-colors hover:border-zinc-700"
              data-testid={`schedule-item-${item.id}`}
              id={`schedule-item-card-${item.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl.startsWith("http") ? item.imageUrl : fileUrl(item.imageUrl)}
                    alt=""
                    className="h-10 w-10 object-cover border border-[#27272a] rounded-sm"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="border border-[#e5ff00] bg-[#e5ff00]/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#e5ff00]">
                  {item.day}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  {item.time}
                </span>
                <div>
                  <span className="truncate font-display text-sm font-bold text-white block">
                    {item.title}
                  </span>
                  {item.genre && (
                    <span className="chip text-[9px] uppercase tracking-wider mt-0.5 inline-block">
                      {item.genre}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id={`btn-edit-schedule-${item.id}`}
                  onClick={() => handleOpenEditModal(item)}
                  className="btn-ghost p-1.5 text-zinc-400 hover:text-[#e5ff00] transition-colors"
                  title="Edit schedule slot"
                  data-testid={`edit-schedule-${item.id}`}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  id={`btn-delete-schedule-${item.id}`}
                  onClick={() => handleOpenDeleteConfirm(item)}
                  className="btn-ghost p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                  title="Delete schedule slot"
                  data-testid={`remove-schedule-${item.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Slot Form */}
      <form onSubmit={handleAddNewItem} className="mt-6 border-t border-[#27272a] pt-5" id="add-schedule-slot-form">
        <div className="flex items-center justify-between mb-3">
          <div className="label-caps">// ADD UPCOMING BROADCAST SLOT</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label-caps text-[10px]">DAY</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="input-terminal text-xs"
              data-testid="schedule-day-select"
              id="add-schedule-day-select"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-caps text-[10px]">TIME / TIMEZONE</label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g. 20:00 - 22:00 UTC"
              className="input-terminal text-xs text-white"
              data-testid="schedule-time-input"
              id="add-schedule-time-input"
            />
          </div>

          <div>
            <label className="label-caps text-[10px]">GENRE / TAG</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="input-terminal text-xs"
              data-testid="schedule-genre-select"
              id="add-schedule-genre-select"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-caps text-[10px]">SET / SHOW TITLE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep DnB Rollers"
              className="input-terminal text-xs text-white"
              data-testid="schedule-title-input"
              id="add-schedule-title-input"
            />
          </div>
        </div>

        {/* Schedule Banner Picture Upload */}
        <div className="mt-3">
          <label className="label-caps text-[10px]">SCHEDULE BANNER PICTURE (OPTIONAL)</label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, false)}
              className="hidden"
              id="schedule-img-upload"
            />
            <label
              htmlFor="schedule-img-upload"
              id="lbl-schedule-img-upload"
              className="btn-ghost inline-flex items-center gap-2 border border-[#27272a] px-3 py-1.5 text-xs text-zinc-300 hover:border-[#e5ff00] cursor-pointer"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[#e5ff00]" />
              {uploadingImage ? "UPLOADING..." : imageUrl ? "CHANGE IMAGE" : "UPLOAD IMAGE"}
            </label>
            {imageUrl && (
              <span className="font-mono text-[10px] text-emerald-400 truncate max-w-xs" id="add-schedule-attached-indicator">
                Image Attached ✓
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary inline-flex items-center justify-center gap-2"
            data-testid="add-schedule-btn"
            id="btn-add-schedule-submit"
          >
            {saving ? (
              <>
                <X className="h-3.5 w-3.5 animate-spin" /> ADDING SLOT...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> ADD BROADCAST TO LIVE SCHEDULE
              </>
            )}
          </button>
        </div>
      </form>

      {/* EDIT MODAL DIALOG */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" id="edit-schedule-modal-overlay">
          <div className="w-full max-w-xl border border-[#e5ff00] bg-[#0a0a0a] p-6 shadow-[0_0_50px_rgba(229,255,0,0.15)] relative font-mono text-white" id="edit-schedule-modal-content">
            <button
              type="button"
              id="btn-close-edit-modal"
              onClick={() => setEditItem(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-5">
              <Edit3 className="h-4 w-4 text-[#e5ff00]" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white">// EDIT SCHEDULED BROADCAST</h3>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4" id="edit-schedule-form">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label-caps text-[10px]">DAY</label>
                  <select
                    value={editDay}
                    onChange={(e) => setEditDay(e.target.value)}
                    className="input-terminal text-xs"
                    id="edit-schedule-day-select"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-caps text-[10px]">TIME / TIMEZONE</label>
                  <input
                    type="text"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="input-terminal text-xs text-white"
                    placeholder="e.g. 20:00 UTC"
                    id="edit-schedule-time-input"
                  />
                </div>

                <div>
                  <label className="label-caps text-[10px]">GENRE / TAG</label>
                  <select
                    value={editGenre}
                    onChange={(e) => setEditGenre(e.target.value)}
                    className="input-terminal text-xs"
                    id="edit-schedule-genre-select"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-caps text-[10px]">SET / SHOW TITLE</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="input-terminal text-xs text-white"
                    placeholder="e.g. Deep DnB Rollers"
                    id="edit-schedule-title-input"
                  />
                </div>
              </div>

              <div>
                <label className="label-caps text-[10px]">DESCRIPTION / SET DETAILS (OPTIONAL)</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Tell your fans what to expect from this set..."
                  className="input-terminal text-xs h-20 resize-none text-white"
                  id="edit-schedule-desc-input"
                />
              </div>

              {/* Edit Schedule Banner Upload */}
              <div>
                <label className="label-caps text-[10px]">BANNER ARTWORK (OPTIONAL)</label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, true)}
                    className="hidden"
                    id="edit-schedule-img-upload"
                  />
                  <label
                    htmlFor="edit-schedule-img-upload"
                    id="lbl-edit-schedule-img-upload"
                    className="btn-ghost inline-flex items-center gap-2 border border-[#27272a] px-3 py-1.5 text-xs text-zinc-300 hover:border-[#e5ff00] cursor-pointer"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-[#e5ff00]" />
                    {uploadingEditImage ? "UPLOADING..." : editImageUrl ? "CHANGE IMAGE" : "UPLOAD IMAGE"}
                  </label>
                  {editImageUrl && (
                    <span className="font-mono text-[10px] text-emerald-400 truncate max-w-xs" id="edit-schedule-attached-indicator">
                      Image Attached ✓
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4 mt-6">
                <button
                  type="button"
                  id="btn-cancel-edit-modal"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 border border-zinc-800 bg-zinc-950 text-zinc-400 font-bold text-xs uppercase tracking-wider hover:bg-zinc-900 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-[#e5ff00] text-black font-black text-xs uppercase tracking-widest hover:bg-[#cbf000] transition-colors flex items-center gap-2"
                  id="btn-save-edit-submit"
                >
                  {savingEdit ? (
                    <>
                      <X className="h-3.5 w-3.5 animate-spin" /> SAVING...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" /> SAVE CHANGES
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in" id="delete-schedule-modal-overlay">
          <div className="w-full max-w-md border border-red-500 bg-[#0a0a0a] p-6 shadow-[0_0_50px_rgba(239,68,68,0.15)] relative font-mono text-white" id="delete-schedule-modal-content">
            <button
              type="button"
              id="btn-close-delete-modal"
              onClick={() => setDeleteConfirmItem(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-red-950/40 pb-3 mb-5">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-red-500">// CONFIRM DELETE SLOT</h3>
            </div>

            <div className="space-y-4" id="delete-schedule-details">
              <p className="text-xs text-zinc-300 leading-relaxed uppercase">
                ARE YOU ABSOLUTELY SURE YOU WANT TO REMOVE THIS SCHEDULED BROADCAST FROM THE STATION PROGRAM?
              </p>

              <div className="border border-red-950/20 bg-red-950/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-red-400 uppercase">
                    {deleteConfirmItem.day}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {deleteConfirmItem.time}
                  </span>
                </div>
                <div className="font-display text-sm font-bold text-white">
                  {deleteConfirmItem.title}
                </div>
                {deleteConfirmItem.genre && (
                  <div className="text-[10px] text-zinc-500 uppercase">
                    GENRE: {deleteConfirmItem.genre}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-zinc-500 leading-normal uppercase">
                * THIS ACTION IS PERMANENT. THE TIME SLOT WILL BE REMOVED INSTANTLY FROM DISCOVERABILITY AND YOUR STATION PROFILE.
              </p>

              <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4 mt-6">
                <button
                  type="button"
                  id="btn-cancel-delete-modal"
                  onClick={() => setDeleteConfirmItem(null)}
                  className="px-4 py-2 border border-zinc-800 bg-zinc-950 text-zinc-400 font-bold text-xs uppercase tracking-wider hover:bg-zinc-900 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-submit"
                  disabled={deleting}
                  onClick={handleDeleteItem}
                  className="px-4 py-2 bg-red-600 text-white font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <X className="h-3.5 w-3.5 animate-spin" /> REMOVING...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" /> DELETE SLOT
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
