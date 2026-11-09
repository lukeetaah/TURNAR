import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Trash2,
  Zap,
  GripVertical,
  AlertCircle,
  Copy,
  Calendar,
  Users,
  UserPlus,
  Search,
  Phone,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useOrg } from '@/contexts/OrgContext';
import { useActivities, type Activity } from '@/hooks/useActivities';
import { useContacts } from '@/hooks/useContacts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

// ─── Constantes de grilla ────────────────────────────────────────────────────
const PX_PER_HOUR = 72; // píxeles por hora
const DAY_START_H = 7;  // 07:00
const DAY_END_H = 22;   // 22:00
const TOTAL_H = DAY_END_H - DAY_START_H;
const GRID_HEIGHT = TOTAL_H * PX_PER_HOUR;
const SNAP_MIN = 15; // snap cada 15 minutos

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const ACT_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-900', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-900', dot: 'bg-emerald-500' },
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-900', dot: 'bg-violet-500' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900', dot: 'bg-orange-500' },
  { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-900', dot: 'bg-rose-500' },
  { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-900', dot: 'bg-teal-500' },
];

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface CalSession {
  id: string;
  activity_id: string;
  start_time: string; // ISO
  end_time: string;   // ISO
  capacity: number;
  booked_count: number;
  status: string;
}

interface DragState {
  sessionId: string;
  startMouseX: number;
  startMouseY: number;
  origTop: number;
  origDayIdx: number;
  currentTop: number;
  currentDayIdx: number;
}

interface SessionBooking {
  id: string;
  contact_id: string;
  status: string;
  created_at: string;
  contacts?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function topFromTime(iso: string): number {
  const d = new Date(iso);
  const hours = d.getHours() + d.getMinutes() / 60;
  return (hours - DAY_START_H) * PX_PER_HOUR;
}

function heightFromTimes(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const mins = (e.getTime() - s.getTime()) / 60000;
  return (mins / 60) * PX_PER_HOUR;
}

function snapToGrid(px: number): number {
  const totalMins = (px / PX_PER_HOUR) * 60;
  const snapped = Math.round(totalMins / SNAP_MIN) * SNAP_MIN;
  return (snapped / 60) * PX_PER_HOUR;
}

function pxToTime(px: number, dayDate: Date): { start: Date; minutes: number } {
  const mins = (px / PX_PER_HOUR) * 60;
  const h = Math.floor(mins / 60) + DAY_START_H;
  const m = Math.round(mins % 60);
  const start = new Date(dayDate);
  start.setHours(h, m, 0, 0);
  return { start, minutes: mins };
}

function colorForActivity(actId: string, activities: Activity[]): (typeof ACT_COLORS)[0] {
  const idx = activities.findIndex((a) => a.id === actId);
  return ACT_COLORS[Math.max(0, idx) % ACT_COLORS.length];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export const Sessions: React.FC = () => {
  const { orgId, orgSlug } = useOrg();
  const { activities } = useActivities(orgId);
  const { contacts } = useContacts(orgId);

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [sessions, setSessions] = useState<CalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // sessionId o 'batch'
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Detalle de Sesión & Inscriptos
  const [activeSession, setActiveSession] = useState<CalSession | null>(null);
  const [sessionBookings, setSessionBookings] = useState<SessionBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [newUserData, setNewUserData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });
  const [contactSearch, setContactSearch] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Edición inline rápida
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ capacity: 10, activity_id: '', start_time: '', end_time: '' });

  // Creación por clic en celda vacía
  const [createSlot, setCreateSlot] = useState<{ dayIdx: number; top: number } | null>(null);
  const [createForm, setCreateForm] = useState({ activity_id: '', capacity: 10 });

  // Modal generador de semana
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({
    activity_id: '',
    days: [true, true, true, true, true, false], // Lun-Sáb
    start_hour: '09:00',
    end_hour: '20:00',
    duration_min: 120,
    break_min: 60,
    capacity: 10,
  });
  const [genPreview, setGenPreview] = useState<{ day: string; slots: string[] }[]>([]);

  // Modal auto-agendar mensual
  const [monthModalOpen, setMonthModalOpen] = useState(false);
  const [cloningMonth, setCloningMonth] = useState(false);

  // Drag & Drop
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragVisual, setDragVisual] = useState({ top: 0, dayIdx: 0 });
  const columnRefs = useRef<(HTMLDivElement | null)[]>(Array(6).fill(null));
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Carga de sesiones ──────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!supabase || !orgId) return;
    setLoading(true);
    setError(null);
    const weekEnd = addDays(weekStart, 6);
    weekEnd.setHours(23, 59, 59, 999);
    const { data, error: err } = await supabase
      .from('activity_sessions')
      .select('id, activity_id, start_time, end_time, capacity, booked_count, status')
      .eq('organization_id', orgId)
      .gte('start_time', weekStart.toISOString())
      .lte('start_time', weekEnd.toISOString())
      .order('start_time');
    if (err) setError(err.message);
    else setSessions((data ?? []) as CalSession[]);
    setLoading(false);
  }, [orgId, weekStart]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Cargar inscriptos de una sesión ────────────────────────────────────────
  const loadSessionBookings = useCallback(async (sessionId: string) => {
    if (!supabase) return;
    setLoadingBookings(true);
    const { data, error: err } = await supabase
      .from('bookings')
      .select(`
        id,
        contact_id,
        status,
        created_at,
        contacts (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (!err && data) {
      setSessionBookings(data as unknown as SessionBooking[]);
    }
    setLoadingBookings(false);
  }, []);

  const openSessionDetail = (session: CalSession) => {
    setActiveSession(session);
    setShowAddUser(false);
    setSelectedContactId('');
    setNewUserData({ first_name: '', last_name: '', email: '', phone: '' });
    setAddUserError(null);
    loadSessionBookings(session.id);
  };

  // ── Sumar usuario a la sesión (Admin) ──────────────────────────────────────
  const handleAddUserToSession = async () => {
    if (!supabase || !orgSlug || !activeSession) return;
    setAddingUser(true);
    setAddUserError(null);

    let fName = newUserData.first_name.trim();
    let lName = newUserData.last_name.trim();
    let email = newUserData.email.trim();
    let phone = newUserData.phone.trim() || null;

    if (selectedContactId) {
      const existing = contacts.find((c) => c.id === selectedContactId);
      if (existing) {
        fName = existing.first_name;
        lName = existing.last_name;
        email = existing.email || `${fName.toLowerCase()}.${lName.toLowerCase()}@turnar.local`;
        phone = existing.phone || null;
      }
    }

    if (!fName || !lName || !email) {
      setAddUserError('Ingresá el nombre, apellido y correo del alumno.');
      setAddingUser(false);
      return;
    }

    const { error: rpcErr } = await supabase.rpc('create_public_booking', {
      p_organization_slug: orgSlug,
      p_session_id: activeSession.id,
      p_first_name: fName,
      p_last_name: lName,
      p_email: email,
      p_phone: phone,
      p_notes: 'Inscripto manualmente desde administración',
    });

    setAddingUser(false);

    if (rpcErr) {
      setAddUserError(rpcErr.message);
    } else {
      setShowAddUser(false);
      setSelectedContactId('');
      setNewUserData({ first_name: '', last_name: '', email: '', phone: '' });
      await loadSessionBookings(activeSession.id);
      await loadSessions();
      // Actualizar cupo local en el modal activo
      setActiveSession((prev) => (prev ? { ...prev, booked_count: prev.booked_count + 1 } : null));
    }
  };

  // ── Desanotar alumno de la sesión ──────────────────────────────────────────
  const handleRemoveBooking = async (bookingId: string) => {
    if (!supabase || !activeSession) return;
    if (!window.confirm('¿Desanotar a este alumno de la clase?')) return;

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await supabase
      .from('activity_sessions')
      .update({ booked_count: Math.max(0, activeSession.booked_count - 1) })
      .eq('id', activeSession.id);

    await loadSessionBookings(activeSession.id);
    await loadSessions();
    setActiveSession((prev) => (prev ? { ...prev, booked_count: Math.max(0, prev.booked_count - 1) } : null));
  };

  // ── Copiar semana anterior ─────────────────────────────────────────────────
  const copyPreviousWeek = async () => {
    if (!supabase || !orgId) return;
    setSaving('batch');
    setError(null);

    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(prevWeekStart, 6);
    prevWeekEnd.setHours(23, 59, 59, 999);

    const { data: prevSessions, error: prevErr } = await supabase
      .from('activity_sessions')
      .select('activity_id, start_time, end_time, capacity')
      .eq('organization_id', orgId)
      .eq('status', 'scheduled')
      .gte('start_time', prevWeekStart.toISOString())
      .lte('start_time', prevWeekEnd.toISOString());

    if (prevErr) {
      setError(prevErr.message);
      setSaving(null);
      return;
    }

    if (!prevSessions || prevSessions.length === 0) {
      setError('La semana anterior no tiene clases programadas para copiar.');
      setSaving(null);
      return;
    }

    // Trasladar 7 días en adelante
    const newSessions = (prevSessions as Array<{ activity_id: string; start_time: string; end_time: string; capacity: number }>).map((s) => {
      const origStart = new Date(s.start_time);
      const origEnd = new Date(s.end_time);
      const newStart = new Date(origStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const newEnd = new Date(origEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        organization_id: orgId,
        activity_id: s.activity_id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        capacity: s.capacity,
        status: 'scheduled',
      };
    });

    const { error: insErr } = await supabase.from('activity_sessions').insert(newSessions);
    setSaving(null);

    if (insErr) {
      setError(insErr.message);
    } else {
      setSuccessMsg(`¡Listo! Se copiaron ${newSessions.length} clases de la semana anterior.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadSessions();
    }
  };

  // ── Auto-agendar mes completo (Repetir mes anterior) ───────────────────────
  const copyPreviousMonth = async () => {
    if (!supabase || !orgId) return;
    setCloningMonth(true);
    setError(null);

    // Calcular mes previo
    const currentYear = weekStart.getFullYear();
    const currentMonth = weekStart.getMonth();
    const prevMonthStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0);
    const prevMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const { data: prevSessions, error: prevErr } = await supabase
      .from('activity_sessions')
      .select('activity_id, start_time, end_time, capacity')
      .eq('organization_id', orgId)
      .eq('status', 'scheduled')
      .gte('start_time', prevMonthStart.toISOString())
      .lte('start_time', prevMonthEnd.toISOString());

    if (prevErr) {
      setError(prevErr.message);
      setCloningMonth(false);
      return;
    }

    if (!prevSessions || prevSessions.length === 0) {
      setError('El mes anterior no tiene clases registradas.');
      setCloningMonth(false);
      return;
    }

    // Replicar las sesiones en el mes actual sumando 4 semanas o desplazando exactamente al mes siguiente
    const newSessions = (prevSessions as Array<{ activity_id: string; start_time: string; end_time: string; capacity: number }>).map((s) => {
      const origStart = new Date(s.start_time);
      const origEnd = new Date(s.end_time);
      const dur = origEnd.getTime() - origStart.getTime();

      // Mismo día y hora en el mes objetivo (+4 semanas / 28 días)
      const newStart = new Date(origStart.getTime() + 28 * 24 * 60 * 60 * 1000);
      const newEnd = new Date(newStart.getTime() + dur);

      return {
        organization_id: orgId,
        activity_id: s.activity_id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        capacity: s.capacity,
        status: 'scheduled',
      };
    });

    const { error: insErr } = await supabase.from('activity_sessions').insert(newSessions);
    setCloningMonth(false);
    setMonthModalOpen(false);

    if (insErr) {
      setError(insErr.message);
    } else {
      setSuccessMsg(`¡Excelente! Se auto-agendaron ${newSessions.length} clases para todo el mes.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await loadSessions();
    }
  };

  // ── Guardar edición inline ─────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!supabase || !editingId) return;
    setSaving(editingId);
    const { error: err } = await supabase
      .from('activity_sessions')
      .update({
        activity_id: editForm.activity_id,
        capacity: editForm.capacity,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
      })
      .eq('id', editingId);
    setSaving(null);
    if (err) { setError(err.message); return; }
    setEditingId(null);
    await loadSessions();
  };

  const openEdit = (s: CalSession) => {
    setEditingId(s.id);
    setEditForm({
      capacity: s.capacity,
      activity_id: s.activity_id,
      start_time: s.start_time,
      end_time: s.end_time,
    });
    setCreateSlot(null);
  };

  // ── Eliminar sesión ────────────────────────────────────────────────────────
  const deleteSession = async (id: string) => {
    if (!supabase) return;
    setSaving(id);
    const { error: err } = await supabase.from('activity_sessions').delete().eq('id', id);
    setSaving(null);
    if (err) { setError(err.message); return; }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
    if (activeSession?.id === id) setActiveSession(null);
  };

  // ── Crear sesión desde clic ────────────────────────────────────────────────
  const handleColumnClick = (e: React.MouseEvent, dayIdx: number) => {
    if (draggingId) return;
    const col = columnRefs.current[dayIdx];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const rawTop = e.clientY - rect.top;
    const snapped = snapToGrid(Math.max(0, rawTop));
    const actId = activities[0]?.id ?? '';
    setCreateSlot({ dayIdx, top: snapped });
    setCreateForm({ activity_id: actId, capacity: activities.find((a) => a.id === actId)?.default_capacity ?? 10 });
    setEditingId(null);
  };

  const confirmCreate = async () => {
    if (!supabase || !orgId || !createSlot || !createForm.activity_id) return;
    setSaving('new');
    const dayDate = addDays(weekStart, createSlot.dayIdx);
    const { start } = pxToTime(createSlot.top, dayDate);
    const act = activities.find((a) => a.id === createForm.activity_id);
    const duration = act?.duration_minutes ?? 60;
    const end = new Date(start.getTime() + duration * 60000);

    const { error: err } = await supabase.from('activity_sessions').insert({
      organization_id: orgId,
      activity_id: createForm.activity_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      capacity: createForm.capacity,
      status: 'scheduled',
    });
    setSaving(null);
    if (err) { setError(err.message); return; }
    setCreateSlot(null);
    await loadSessions();
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const getDayIndexFromX = (clientX: number): number => {
    for (let i = 0; i < 6; i++) {
      const col = columnRefs.current[i];
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return i;
    }
    return -1;
  };

  const handleDragStart = (e: React.MouseEvent, session: CalSession, dayIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const origTop = topFromTime(session.start_time);
    dragRef.current = {
      sessionId: session.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origTop,
      origDayIdx: dayIdx,
      currentTop: origTop,
      currentDayIdx: dayIdx,
    };
    setDraggingId(session.id);
    setDragVisual({ top: origTop, dayIdx });
    setEditingId(null);
    setCreateSlot(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = e.clientY - dragRef.current.startMouseY;
      const rawTop = dragRef.current.origTop + dy;
      const snapped = Math.max(0, Math.min(snapToGrid(rawTop), GRID_HEIGHT - 30));
      const dayIdx = getDayIndexFromX(e.clientX);
      dragRef.current.currentTop = snapped;
      dragRef.current.currentDayIdx = dayIdx >= 0 ? dayIdx : dragRef.current.currentDayIdx;
      setDragVisual({ top: snapped, dayIdx: dragRef.current.currentDayIdx });
    };

    const onUp = async (_e: MouseEvent) => {
      if (!dragRef.current || !supabase) { dragRef.current = null; setDraggingId(null); return; }
      const { sessionId, currentTop, currentDayIdx, origTop, origDayIdx } = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);

      const movedEnough = Math.abs(currentTop - origTop) > 5 || currentDayIdx !== origDayIdx;
      if (!movedEnough) return;

      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const duration = new Date(session.end_time).getTime() - new Date(session.start_time).getTime();
      const dayDate = addDays(weekStart, currentDayIdx);
      const { start } = pxToTime(currentTop, dayDate);
      const end = new Date(start.getTime() + duration);

      setSaving(sessionId);
      const { error: err } = await supabase
        .from('activity_sessions')
        .update({ start_time: start.toISOString(), end_time: end.toISOString() })
        .eq('id', sessionId);
      setSaving(null);
      if (err) { setError(err.message); return; }
      await loadSessions();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sessions, weekStart, loadSessions]);

  // ── Generador de semana ────────────────────────────────────────────────────
  const computeGenPreview = useCallback(() => {
    const preview: { day: string; slots: string[] }[] = [];
    const [sh, sm] = genForm.start_hour.split(':').map(Number);
    const [eh, em] = genForm.end_hour.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    genForm.days.forEach((active, i) => {
      if (!active) return;
      const slots: string[] = [];
      let cur = startMins;
      while (cur + genForm.duration_min <= endMins) {
        const s = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        const e = `${String(Math.floor((cur + genForm.duration_min) / 60)).padStart(2, '0')}:${String((cur + genForm.duration_min) % 60).padStart(2, '0')}`;
        slots.push(`${s} – ${e}`);
        cur += genForm.duration_min + genForm.break_min;
      }
      if (slots.length > 0) preview.push({ day: DAYS[i], slots });
    });
    setGenPreview(preview);
  }, [genForm]);

  useEffect(() => { if (genOpen) computeGenPreview(); }, [genOpen, genForm, computeGenPreview]);

  const handleGenerate = async () => {
    if (!supabase || !orgId || !genForm.activity_id) return;
    setSaving('batch');
    setError(null);

    const [sh, sm] = genForm.start_hour.split(':').map(Number);
    const [eh, em] = genForm.end_hour.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    const toInsert: object[] = [];
    genForm.days.forEach((active, i) => {
      if (!active) return;
      const dayDate = addDays(weekStart, i);
      let cur = startMins;
      while (cur + genForm.duration_min <= endMins) {
        const startDt = new Date(dayDate);
        startDt.setHours(Math.floor(cur / 60), cur % 60, 0, 0);
        const endDt = new Date(startDt.getTime() + genForm.duration_min * 60000);
        toInsert.push({
          organization_id: orgId,
          activity_id: genForm.activity_id,
          start_time: startDt.toISOString(),
          end_time: endDt.toISOString(),
          capacity: genForm.capacity,
          status: 'scheduled',
        });
        cur += genForm.duration_min + genForm.break_min;
      }
    });

    const { error: err } = await supabase.from('activity_sessions').insert(toInsert);
    setSaving(null);
    if (err) { setError(err.message); return; }
    setGenOpen(false);
    await loadSessions();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: TOTAL_H + 1 }, (_, i) => DAY_START_H + i);

  const getDayIdx = (iso: string): number => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return weekDays.findIndex((wd) => {
      const w = new Date(wd); w.setHours(0, 0, 0, 0);
      return w.getTime() === d.getTime();
    });
  };

  const isToday = (d: Date) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const c = new Date(d); c.setHours(0, 0, 0, 0);
    return t.getTime() === c.getTime();
  };

  // Filtrado de contactos para el selector
  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* ── Barra superior ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-brand-200 bg-white shrink-0">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Sesiones y Horarios</h1>
          <p className="text-xs text-brand-400">
            Hacé clic en el calendario para crear, arrastrá para mover, o tocá una clase para sumar alumnos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy className="w-3.5 h-3.5" />}
            onClick={copyPreviousWeek}
            loading={saving === 'batch'}
            title="Copia todas las clases de la semana anterior a esta semana"
          >
            Copiar semana anterior
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Calendar className="w-3.5 h-3.5" />}
            onClick={() => setMonthModalOpen(true)}
            title="Replicar el mes anterior automáticamente"
          >
            📅 Repetir mes anterior
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => { setGenForm((f) => ({ ...f, activity_id: activities[0]?.id ?? '' })); setGenOpen(true); }}
            disabled={activities.length === 0}
          >
            Generar semana
          </Button>
        </div>
      </div>

      {/* ── Navegador de semana ── */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-2.5 border-b border-brand-100 bg-white shrink-0">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="p-1.5 rounded-lg hover:bg-brand-100 text-brand-600 transition-colors"
          title="Semana anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-brand-800 min-w-[200px] text-center">
          {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 5))}
        </span>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="p-1.5 rounded-lg hover:bg-brand-100 text-brand-600 transition-colors"
          title="Semana siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setWeekStart(getMonday(new Date()))}
          className="ml-2 text-xs text-brand-500 hover:text-brand-900 underline underline-offset-2 transition-colors"
        >
          Hoy
        </button>

        {/* Leyenda de actividades */}
        <div className="ml-auto flex items-center gap-3 overflow-x-auto">
          {activities.map((a, i) => {
            const c = ACT_COLORS[i % ACT_COLORS.length];
            return (
              <span key={a.id} className="flex items-center gap-1.5 text-xs text-brand-600 whitespace-nowrap">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {a.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-2 shrink-0">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Grilla del calendario ── */}
      <div className="flex-1 overflow-auto select-none">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="min-w-[700px]">
            {/* Cabecera de días */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-brand-200">
              <div className="w-14 shrink-0" />
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  className={`flex-1 text-center py-2.5 text-xs font-bold border-l border-brand-100 ${
                    isToday(d) ? 'text-brand-900 bg-brand-50' : 'text-brand-500'
                  }`}
                >
                  <div>{DAYS[i]}</div>
                  <div className={`text-sm mt-0.5 ${isToday(d) ? 'w-6 h-6 bg-brand-900 text-white rounded-full flex items-center justify-center mx-auto' : ''}`}>
                    {d.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {/* Cuerpo del calendario */}
            <div ref={gridRef} className="flex relative" style={{ height: GRID_HEIGHT }}>
              {/* Columna de horas */}
              <div className="w-14 shrink-0 relative">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 text-[10px] text-brand-400 -translate-y-2"
                    style={{ top: (h - DAY_START_H) * PX_PER_HOUR }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Columnas de días */}
              {weekDays.map((dayDate, dayIdx) => {
                const daySessions = sessions.filter(
                  (s) => getDayIdx(s.start_time) === dayIdx && s.status !== 'cancelled'
                );
                const isEditing = daySessions.some((s) => s.id === editingId);

                return (
                  <div
                    key={dayIdx}
                    ref={(el) => { columnRefs.current[dayIdx] = el; }}
                    className={`flex-1 relative border-l border-brand-100 cursor-pointer ${
                      isToday(dayDate) ? 'bg-brand-50/40' : ''
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.session-block')) return;
                      if (editingId) { setEditingId(null); return; }
                      handleColumnClick(e, dayIdx);
                    }}
                  >
                    {/* Líneas de hora */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-brand-100"
                        style={{ top: (h - DAY_START_H) * PX_PER_HOUR }}
                      />
                    ))}
                    {/* Líneas de media hora */}
                    {hours.slice(0, -1).map((h) => (
                      <div
                        key={`h${h}`}
                        className="absolute left-0 right-0 border-t border-brand-50"
                        style={{ top: (h - DAY_START_H) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                      />
                    ))}

                    {/* Fantasma de creación */}
                    {createSlot?.dayIdx === dayIdx && !isEditing && (
                      <div
                        className="absolute left-1 right-1 rounded-lg bg-brand-900/10 border-2 border-dashed border-brand-400 z-10 flex flex-col p-2 gap-1 session-block"
                        style={{ top: createSlot.top, height: Math.max(40, ((activities.find((a) => a.id === createForm.activity_id)?.duration_minutes ?? 60) / 60) * PX_PER_HOUR) }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          className="text-[10px] rounded px-1 py-0.5 border border-brand-300 bg-white w-full"
                          value={createForm.activity_id}
                          onChange={(e) => {
                            const actId = e.target.value;
                            const cap = activities.find((a) => a.id === actId)?.default_capacity ?? 10;
                            setCreateForm({ activity_id: actId, capacity: cap });
                          }}
                        >
                          {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={createForm.capacity}
                          onChange={(e) => setCreateForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                          className="text-[10px] rounded px-1 py-0.5 border border-brand-300 bg-white w-full"
                          placeholder="Cupo"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex gap-1 mt-auto">
                          <button
                            onClick={(e) => { e.stopPropagation(); confirmCreate(); }}
                            disabled={saving === 'new'}
                            className="flex-1 flex items-center justify-center gap-1 py-0.5 rounded bg-brand-900 text-white text-[10px] hover:bg-brand-700 disabled:opacity-50"
                          >
                            {saving === 'new' ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                            Crear
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCreateSlot(null); }}
                            className="flex-1 flex items-center justify-center gap-1 py-0.5 rounded border border-brand-300 text-brand-600 text-[10px] hover:bg-brand-50"
                          >
                            <X className="w-2.5 h-2.5" /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Sesiones */}
                    {daySessions.map((session) => {
                      const isDragging = draggingId === session.id && dragVisual.dayIdx === dayIdx;
                      const isBeingEdited = editingId === session.id;
                      const top = isDragging ? dragVisual.top : topFromTime(session.start_time);
                      const height = Math.max(34, heightFromTimes(session.start_time, session.end_time));
                      const color = colorForActivity(session.activity_id, activities);
                      const actName = activities.find((a) => a.id === session.activity_id)?.name ?? '—';
                      const isSav = saving === session.id;

                      return (
                        <div
                          key={session.id}
                          className={`session-block absolute left-1 right-1 rounded-lg border ${color.bg} ${color.border} ${color.text} transition-shadow z-20
                            ${isDragging ? 'shadow-2xl opacity-90 scale-[1.02] z-30' : 'hover:shadow-md'}
                            ${isBeingEdited ? 'ring-2 ring-brand-900 z-30' : ''}
                          `}
                          style={{ top, height }}
                        >
                          {/* Modo edición rápida inline */}
                          {isBeingEdited ? (
                            <div
                              className="p-1.5 flex flex-col gap-1 h-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                className="text-[10px] rounded px-1 py-0.5 border border-brand-300 bg-white w-full"
                                value={editForm.activity_id}
                                onChange={(e) => setEditForm((f) => ({ ...f, activity_id: e.target.value }))}
                              >
                                {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                              <div className="flex gap-1">
                                <input
                                  type="time"
                                  value={editForm.start_time ? new Date(editForm.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                                  onChange={(e) => {
                                    const [h, m] = e.target.value.split(':').map(Number);
                                    const d = new Date(editForm.start_time);
                                    d.setHours(h, m, 0, 0);
                                    const dur = new Date(editForm.end_time).getTime() - new Date(editForm.start_time).getTime();
                                    const newEnd = new Date(d.getTime() + dur);
                                    setEditForm((f) => ({ ...f, start_time: d.toISOString(), end_time: newEnd.toISOString() }));
                                  }}
                                  className="text-[10px] rounded px-1 py-0.5 border border-brand-300 bg-white flex-1"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  value={editForm.capacity}
                                  onChange={(e) => setEditForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                                  className="text-[10px] rounded px-1 py-0.5 border border-brand-300 bg-white w-12"
                                  placeholder="Cupo"
                                />
                              </div>
                              <div className="flex gap-1 mt-auto">
                                <button
                                  onClick={() => saveEdit()}
                                  disabled={isSav}
                                  className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded bg-brand-900 text-white text-[10px] hover:bg-brand-700 disabled:opacity-50"
                                >
                                  {isSav ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                                  Guardar
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded border border-brand-400 text-[10px] hover:bg-white/50"
                                >
                                  <X className="w-2.5 h-2.5" /> Cancelar
                                </button>
                                <button
                                  onClick={() => { if (window.confirm('¿Eliminar esta sesión?')) deleteSession(session.id); }}
                                  className="p-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50 text-[10px]"
                                  title="Eliminar sesión"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Modo normal */
                            <div
                              className="flex flex-col h-full px-1.5 py-1 cursor-pointer overflow-hidden"
                              onClick={(e) => { e.stopPropagation(); openSessionDetail(session); }}
                            >
                              {/* Handle de drag */}
                              <div
                                className="flex items-start gap-1"
                                onMouseDown={(e) => handleDragStart(e, session, dayIdx)}
                              >
                                <GripVertical className="w-3 h-3 shrink-0 mt-0.5 opacity-40 cursor-grab" />
                                <span className="text-[11px] font-bold leading-tight truncate">{actName}</span>
                                {isSav && <span className="ml-auto w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                              </div>
                              {height > 44 && (
                                <div className="text-[10px] opacity-70 mt-0.5 ml-4">
                                  {fmtTime(session.start_time)} – {fmtTime(session.end_time)}
                                </div>
                              )}
                              {height > 56 && (
                                <div className="text-[10px] font-semibold mt-auto ml-4 flex items-center justify-between">
                                  <span>{session.booked_count}/{session.capacity} cupos</span>
                                  <span className="text-[9px] bg-white/60 px-1 rounded hover:bg-white transition-colors">
                                    + Alumnos
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Bloque fantasma en la columna correcta durante drag */}
                    {draggingId && dragVisual.dayIdx === dayIdx && getDayIdx(sessions.find(s => s.id === draggingId)?.start_time ?? '') !== dayIdx && (
                      <div
                        className="absolute left-1 right-1 rounded-lg border-2 border-dashed border-brand-400 bg-brand-100/50 z-20 pointer-events-none"
                        style={{
                          top: dragVisual.top,
                          height: Math.max(32, heightFromTimes(
                            sessions.find(s => s.id === draggingId)?.start_time ?? '',
                            sessions.find(s => s.id === draggingId)?.end_time ?? ''
                          )),
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tooltip de ayuda */}
      {activities.length === 0 && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Primero creá al menos una actividad en la sección <strong>Actividades</strong> para poder programar sesiones.
        </div>
      )}

      {/* ── Modal Detalle de Sesión & Gestión de Inscriptos ── */}
      <Modal
        open={Boolean(activeSession)}
        onClose={() => setActiveSession(null)}
        title={
          activeSession
            ? `${activities.find((a) => a.id === activeSession.activity_id)?.name ?? 'Clase'} · ${fmtTime(activeSession.start_time)} – ${fmtTime(activeSession.end_time)}`
            : 'Detalle de la clase'
        }
      >
        {activeSession && (
          <div className="space-y-4">
            {/* Resumen de ocupación */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-brand-50 border border-brand-200">
              <div>
                <span className="text-xs text-brand-500 block">Ocupación de la clase</span>
                <span className="text-base font-bold text-brand-900">
                  {activeSession.booked_count} de {activeSession.capacity} alumnos inscriptos
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-brand-500 block">Lugares libres</span>
                <span className={`text-base font-bold ${activeSession.capacity - activeSession.booked_count > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {Math.max(0, activeSession.capacity - activeSession.booked_count)} disponibles
                </span>
              </div>
            </div>

            {/* Inscriptos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Alumnos inscriptos ({sessionBookings.length})
                </h4>
                <Button
                  size="xs"
                  variant="secondary"
                  icon={<UserPlus className="w-3.5 h-3.5" />}
                  onClick={() => setShowAddUser(!showAddUser)}
                >
                  {showAddUser ? 'Ocultar' : '+ Sumar usuario'}
                </Button>
              </div>

              {/* Formulario para sumar usuario a la clase */}
              {showAddUser && (
                <div className="p-3 mb-3 rounded-xl bg-brand-100/60 border border-brand-300 space-y-3">
                  <span className="text-xs font-bold text-brand-900 block">
                    Anotar alumno a esta clase
                  </span>

                  {addUserError && (
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                      {addUserError}
                    </div>
                  )}

                  {/* Opción 1: Elegir de alumnos existentes */}
                  {contacts.length > 0 && (
                    <div>
                      <label className="text-[11px] font-semibold text-brand-700 block mb-1">
                        Elegir de contactos existentes:
                      </label>
                      <div className="flex gap-2 mb-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-brand-400" />
                          <input
                            type="text"
                            placeholder="Buscar alumno por nombre o email..."
                            value={contactSearch}
                            onChange={(e) => setContactSearch(e.target.value)}
                            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-brand-300 bg-white"
                          />
                        </div>
                      </div>
                      <select
                        className="w-full text-xs rounded-lg border border-brand-300 px-2 py-1.5 bg-white mb-2"
                        value={selectedContactId}
                        onChange={(e) => {
                          setSelectedContactId(e.target.value);
                          if (e.target.value) {
                            const found = contacts.find((c) => c.id === e.target.value);
                            if (found) {
                              setNewUserData({
                                first_name: found.first_name,
                                last_name: found.last_name,
                                email: found.email || '',
                                phone: found.phone || '',
                              });
                            }
                          }
                        }}
                      >
                        <option value="">-- O seleccionar de la lista ({filteredContacts.length}) --</option>
                        {filteredContacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.first_name} {c.last_name} {c.email ? `(${c.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Opción 2: Cargar nuevo alumno */}
                  <div className="space-y-2 pt-1 border-t border-brand-200">
                    <span className="text-[11px] font-semibold text-brand-700 block">
                      Datos del alumno:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Nombre"
                        placeholder="Juan"
                        value={newUserData.first_name}
                        onChange={(e) => setNewUserData({ ...newUserData, first_name: e.target.value })}
                        required
                      />
                      <Input
                        label="Apellido"
                        placeholder="Pérez"
                        value={newUserData.last_name}
                        onChange={(e) => setNewUserData({ ...newUserData, last_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Correo"
                        type="email"
                        placeholder="juan@ejemplo.com"
                        value={newUserData.email}
                        onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                        required
                      />
                      <Input
                        label="Teléfono / WhatsApp"
                        placeholder="+54 9 11..."
                        value={newUserData.phone}
                        onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setShowAddUser(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="xs"
                      onClick={handleAddUserToSession}
                      loading={addingUser}
                      icon={<UserPlus className="w-3.5 h-3.5" />}
                    >
                      Inscribir ahora
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de alumnos inscriptos */}
              {loadingBookings ? (
                <div className="text-center py-4">
                  <span className="w-4 h-4 border-2 border-brand-900 border-t-transparent rounded-full animate-spin inline-block" />
                </div>
              ) : sessionBookings.length === 0 ? (
                <div className="text-center py-5 border border-dashed border-brand-200 rounded-xl text-xs text-brand-400">
                  Todavía no hay alumnos anotados en esta clase.
                </div>
              ) : (
                <div className="divide-y divide-brand-100 border border-brand-200 rounded-xl overflow-hidden bg-white">
                  {sessionBookings.map((b) => (
                    <div key={b.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-brand-50">
                      <div>
                        <span className="font-bold text-brand-900 block">
                          {b.contacts?.first_name} {b.contacts?.last_name}
                        </span>
                        <div className="text-[11px] text-brand-500 flex items-center gap-2 mt-0.5">
                          {b.contacts?.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 opacity-60" /> {b.contacts.email}
                            </span>
                          )}
                          {b.contacts?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 opacity-60" /> {b.contacts.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveBooking(b.id)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors text-[11px]"
                        title="Desanotar alumno"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Acciones de la sesión */}
            <div className="pt-3 border-t border-brand-200 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                onClick={() => {
                  if (window.confirm('¿Estás seguro de eliminar esta clase del calendario?')) {
                    deleteSession(activeSession.id);
                  }
                }}
              >
                Eliminar clase
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const act = activeSession;
                    setActiveSession(null);
                    openEdit(act);
                  }}
                >
                  Modificar horario / cupo
                </Button>
                <Button variant="primary" size="sm" onClick={() => setActiveSession(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Auto-agendar mensual ── */}
      <Modal open={monthModalOpen} onClose={() => setMonthModalOpen(false)} title="📅 Auto-agendar mes completo">
        <div className="space-y-4">
          <p className="text-xs text-brand-600">
            Esta opción replica de forma automática la programación de clases del <strong>mes anterior</strong> al <strong>mes actual</strong>.
          </p>
          <div className="p-3.5 bg-brand-50 rounded-xl border border-brand-200 text-xs text-brand-800 space-y-1.5">
            <div className="font-bold">¿Cómo funciona?</div>
            <ul className="list-disc list-inside space-y-1 text-brand-600 text-[11px]">
              <li>Toma todas las clases y horarios ya configurados el mes pasado.</li>
              <li>Las replica en los mismos días de la semana y mismos horarios (ej. martes y jueves de 18 a 20hs).</li>
              <li>Conserva los cupos y actividades correspondientes.</li>
              <li>No tenés que volver a cargar clase por clase manualmente.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-brand-100">
            <Button variant="secondary" onClick={() => setMonthModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={copyPreviousMonth}
              loading={cloningMonth}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              Replicar mes anterior ahora
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal generador de semana ── */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="⚡ Generar semana de sesiones">
        <div className="space-y-4">
          {error && <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-brand-700 mb-1">Actividad</label>
            <select
              className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2 bg-white"
              value={genForm.activity_id}
              onChange={(e) => setGenForm((f) => ({ ...f, activity_id: e.target.value }))}
            >
              <option value="">Seleccioná una actividad...</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.duration_minutes} min)</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-700 mb-2">Días de la semana</label>
            <div className="flex gap-2">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setGenForm((f) => {
                    const days = [...f.days];
                    days[i] = !days[i];
                    return { ...f, days };
                  })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    genForm.days[i]
                      ? 'bg-brand-900 text-white'
                      : 'bg-brand-100 text-brand-500 hover:bg-brand-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brand-700 mb-1">Desde</label>
              <input
                type="time"
                value={genForm.start_hour}
                onChange={(e) => setGenForm((f) => ({ ...f, start_hour: e.target.value }))}
                className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-700 mb-1">Hasta</label>
              <input
                type="time"
                value={genForm.end_hour}
                onChange={(e) => setGenForm((f) => ({ ...f, end_hour: e.target.value }))}
                className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-700 mb-1">Duración de clase (minutos)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={genForm.duration_min}
                onChange={(e) => setGenForm((f) => ({ ...f, duration_min: Number(e.target.value) }))}
                className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-700 mb-1">Descanso entre clases (minutos)</label>
              <input
                type="number"
                min={0}
                step={15}
                value={genForm.break_min}
                onChange={(e) => setGenForm((f) => ({ ...f, break_min: Number(e.target.value) }))}
                className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-brand-700 mb-1">Cupo por sesión</label>
              <input
                type="number"
                min={1}
                value={genForm.capacity}
                onChange={(e) => setGenForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2"
              />
            </div>
          </div>

          {/* Preview */}
          {genPreview.length > 0 && (
            <div className="bg-brand-50 rounded-xl p-3 border border-brand-200">
              <p className="text-xs font-bold text-brand-700 mb-2">
                Vista previa — {genPreview.reduce((acc, d) => acc + d.slots.length, 0)} sesiones a crear
              </p>
              <div className="grid grid-cols-2 gap-2">
                {genPreview.map(({ day, slots }) => (
                  <div key={day}>
                    <span className="text-[10px] font-bold text-brand-600 uppercase">{day}</span>
                    {slots.map((s) => (
                      <div key={s} className="text-[11px] text-brand-700 ml-1">· {s}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-brand-100">
            <Button variant="secondary" onClick={() => setGenOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleGenerate}
              loading={saving === 'batch'}
              disabled={!genForm.activity_id || genPreview.length === 0}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              Generar {genPreview.reduce((acc, d) => acc + d.slots.length, 0)} sesiones
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
