import React, { useState } from 'react';
import { Users, Plus, Search, Mail, Phone, Edit2 } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useContacts } from '@/hooks/useContacts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Database } from '@/lib/supabase/types';

type Contact = Database['public']['Tables']['contacts']['Row'];

export const Contacts: React.FC = () => {
  const { orgId } = useOrg();
  const { contacts, loading, error, createContact, updateContact } = useContacts(orgId);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    birth_date: '',
    is_minor: false,
    is_active: true,
  });

  const openCreate = () => {
    setEditingContact(null);
    setForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      birth_date: '',
      is_minor: false,
      is_active: true,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditingContact(c);
    setForm({
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email || '',
      phone: c.phone || '',
      birth_date: c.birth_date || '',
      is_minor: c.is_minor || false,
      is_active: c.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      birth_date: form.birth_date || null,
      is_minor: Boolean(form.is_minor),
      is_active: Boolean(form.is_active),
    };

    let res;
    if (editingContact) {
      res = await updateContact(editingContact.id, payload);
    } else {
      res = await createContact(payload);
    }

    setSaving(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      setModalOpen(false);
    }
  };

  const filtered = contacts.filter((c) => {
    const term = search.toLowerCase();
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    const email = (c.email || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    return fullName.includes(term) || email.includes(term) || phone.includes(term);
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Alumnos y Contactos</h1>
          <p className="text-xs text-brand-400">Padrón de asistentes, datos de contacto y estado</p>
        </div>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
          Nuevo alumno
        </Button>
      </div>

      {/* Barra de búsqueda */}
      <div className="mb-4 max-w-md">
        <Input
          placeholder="Buscar por nombre, correo o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-4 h-4 text-brand-400" />}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No tenés alumnos registrados"
          description="Podés agregarlos manualmente aquí o se crearán automáticamente cuando hagan su primera reserva pública."
          action={
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              Agregar primer alumno
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-brand-400 text-xs">
          No se encontraron contactos que coincidan con "{search}".
        </div>
      ) : (
        <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                  <th className="py-2.5 px-4 font-semibold">Nombre</th>
                  <th className="py-2.5 px-4 font-semibold">Contacto</th>
                  <th className="py-2.5 px-4 font-semibold">Tipo</th>
                  <th className="py-2.5 px-4 font-semibold">Estado</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-50/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-brand-900">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="py-3 px-4 text-brand-600">
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Mail className="w-3 h-3 text-brand-400" />
                          <span>{c.email}</span>
                        </div>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-[11px] mt-0.5 text-brand-500">
                          <Phone className="w-3 h-3 text-brand-400" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {c.is_minor ? (
                        <Badge variant="warning">Menor</Badge>
                      ) : (
                        <Badge variant="default">Adulto</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={c.is_active ? 'success' : 'muted'}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Edit2 className="w-3 h-3" />}
                        onClick={() => openEdit(c)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Contacto */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingContact ? 'Editar alumno' : 'Nuevo alumno'}
      >
        {formError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              placeholder="Juan"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
            />
            <Input
              label="Apellido"
              placeholder="Pérez"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              required
            />
          </div>

          <Input
            label="Correo electrónico"
            type="email"
            placeholder="juan@ejemplo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <Input
            label="Teléfono / WhatsApp"
            placeholder="+54 9 11 ..."
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <Input
            label="Fecha de nacimiento"
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />

          <div className="pt-2 border-t border-brand-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_minor}
                onChange={(e) => setForm({ ...form, is_minor: e.target.checked })}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">Es menor de edad</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">Contacto activo</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editingContact ? 'Guardar cambios' : 'Crear contacto'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
