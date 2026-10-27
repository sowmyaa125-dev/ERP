import { useEffect, useState } from 'react'
import { getCompanies } from '../api/companies'
import { getBranches } from '../api/branches'
import * as api from '../api/masters'

const TABS = [
  { key: 'groups', label: 'Groups' },
  { key: 'subGroups', label: 'Sub Groups' },
  { key: 'categories', label: 'Categories' },
  { key: 'subCategories', label: 'Sub Categories' },
  { key: 'brands', label: 'Brands' },
  { key: 'units', label: 'Units' },
  { key: 'gstMasters', label: 'GST Masters' },
  { key: 'warehouses', label: 'Warehouses' },
]

export default function Masters() {
  const [tab, setTab] = useState('groups')

  const [companies, setCompanies] = useState([])
  const [branches, setBranches] = useState([])
  const [groups, setGroups] = useState([])
  const [subGroups, setSubGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [units, setUnits] = useState([])
  const [gstMasters, setGstMasters] = useState([])
  const [warehouses, setWarehouses] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      getCompanies(), getBranches(),
      api.getGroups(), api.getSubGroups(), api.getCategories(), api.getSubCategories(),
      api.getBrands(), api.getUnits(), api.getGstMasters(), api.getWarehouses(),
    ])
      .then(([co, br, g, sg, cat, scat, b, u, gst, wh]) => {
        setCompanies(co.data)
        setBranches(br.data)
        setGroups(g.data)
        setSubGroups(sg.data)
        setCategories(cat.data)
        setSubCategories(scat.data)
        setBrands(b.data)
        setUnits(u.data)
        setGstMasters(gst.data)
        setWarehouses(wh.data)
      })
      .catch(() => setError('Failed to load masters.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [])

  const companyName = (id) => companies.find((c) => c.id === id)?.name ?? id

  return (
    <div className="container mt-4">
      <h2 className="mb-3">Masters</h2>
      <p className="text-muted mb-3" style={{ fontSize: '0.8rem', marginTop: '-0.75rem' }}>
        Manage reference data used across your products and inventory
      </p>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              className={`nav-link ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p className="text-muted">Loading...</p>}

      {!loading && !error && (
        <>
          {tab === 'groups' && (
            <SimpleMaster
              items={groups} companies={companies} companyName={companyName}
              createFn={api.createGroup} updateFn={api.updateGroup} onSaved={loadAll}
            />
          )}
          {tab === 'categories' && (
            <SimpleMaster
              items={categories} companies={companies} companyName={companyName}
              createFn={api.createCategory} updateFn={api.updateCategory} onSaved={loadAll}
            />
          )}
          {tab === 'brands' && (
            <SimpleMaster
              items={brands} companies={companies} companyName={companyName}
              createFn={api.createBrand} updateFn={api.updateBrand} onSaved={loadAll}
            />
          )}
          {tab === 'subGroups' && (
            <ChildMaster
              items={subGroups} companies={companies} companyName={companyName}
              parents={groups} parentField="group" parentLabel="Group"
              createFn={api.createSubGroup} updateFn={api.updateSubGroup} onSaved={loadAll}
            />
          )}
          {tab === 'subCategories' && (
            <ChildMaster
              items={subCategories} companies={companies} companyName={companyName}
              parents={categories} parentField="category" parentLabel="Category"
              createFn={api.createSubCategory} updateFn={api.updateSubCategory} onSaved={loadAll}
            />
          )}
          {tab === 'units' && (
            <UnitMaster items={units} companies={companies} companyName={companyName} onSaved={loadAll} />
          )}
          {tab === 'gstMasters' && (
            <GstMasterTab items={gstMasters} companies={companies} companyName={companyName} onSaved={loadAll} />
          )}
          {tab === 'warehouses' && (
            <WarehouseTab
              items={warehouses} companies={companies} companyName={companyName}
              branches={branches} onSaved={loadAll}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Shared status badge + edit/toggle action buttons, used by every tab below */
function RowActions({ editing, onEdit, onSave, onCancel, active, onToggle }) {
  if (editing) {
    return (
      <div className="d-flex gap-1">
        <button className="btn btn-success btn-sm" onClick={onSave}>Save</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="d-flex gap-1">
      <button className="btn btn-outline-primary btn-sm" onClick={onEdit}>Edit</button>
      <button
        className={`btn btn-sm ${active ? 'btn-outline-danger' : 'btn-outline-success'}`}
        onClick={onToggle}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  )
}

/** Group / Category / Brand — just company + name */
function SimpleMaster({ items, companies, companyName, createFn, updateFn, onSaved }) {
  const [form, setForm] = useState({ company: '', name: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createFn(form)
      setForm({ company: '', name: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (i) => { setEditingId(i.id); setEditName(i.name) }
  const cancelEdit = () => { setEditingId(null); setEditName('') }
  const saveEdit = async (id) => {
    try {
      await updateFn(id, { name: editName })
      setEditingId(null)
      onSaved()
    } catch { alert('Failed to save.') }
  }
  const toggle = async (i) => {
    try {
      await updateFn(i.id, { status: !i.status })
      onSaved()
    } catch { alert('Failed to update status.') }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card card-body mb-4">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-md-5">
            <label className="form-label">Company</label>
            <select className="form-select" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required>
              <option value="">-- Select --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-5">
            <label className="form-label">Name</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="col-md-2">
            <button className="btn btn-success w-100" disabled={submitting}>Add</button>
          </div>
        </div>
      </form>
      <table className="table table-striped">
        <thead><tr><th>Name</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : i.name}
              </td>
              <td>{companyName(i.company)}</td>
              <td><span className={`badge ${i.status ? 'bg-success' : 'bg-secondary'}`}>{i.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                <RowActions
                  editing={editingId === i.id}
                  onEdit={() => startEdit(i)} onSave={() => saveEdit(i.id)} onCancel={cancelEdit}
                  active={i.status} onToggle={() => toggle(i)}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="4" className="text-center text-muted">None found.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

/** Sub Group / Sub Category — company + parent (Group or Category) + name */
function ChildMaster({ items, companies, companyName, parents, parentField, parentLabel, createFn, updateFn, onSaved }) {
  const [form, setForm] = useState({ company: '', [parentField]: '', name: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const visibleParents = parents.filter((p) => String(p.company) === String(form.company))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createFn(form)
      setForm({ company: '', [parentField]: '', name: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  const parentName = (id) => parents.find((p) => p.id === id)?.name ?? id
  const startEdit = (i) => { setEditingId(i.id); setEditName(i.name) }
  const cancelEdit = () => { setEditingId(null); setEditName('') }
  const saveEdit = async (id) => {
    try {
      await updateFn(id, { name: editName })
      setEditingId(null)
      onSaved()
    } catch { alert('Failed to save.') }
  }
  const toggle = async (i) => {
    try {
      await updateFn(i.id, { status: !i.status })
      onSaved()
    } catch { alert('Failed to update status.') }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card card-body mb-4">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">Company</label>
            <select className="form-select" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value, [parentField]: '' })} required>
              <option value="">-- Select --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">{parentLabel}</label>
            <select className="form-select" value={form[parentField]} onChange={(e) => setForm({ ...form, [parentField]: e.target.value })} required disabled={!form.company}>
              <option value="">-- Select --</option>
              {visibleParents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Name</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="col-md-2">
            <button className="btn btn-success w-100" disabled={submitting}>Add</button>
          </div>
        </div>
      </form>
      <table className="table table-striped">
        <thead><tr><th>Name</th><th>{parentLabel}</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : i.name}
              </td>
              <td>{parentName(i[parentField])}</td>
              <td>{companyName(i.company)}</td>
              <td><span className={`badge ${i.status ? 'bg-success' : 'bg-secondary'}`}>{i.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                <RowActions
                  editing={editingId === i.id}
                  onEdit={() => startEdit(i)} onSave={() => saveEdit(i.id)} onCancel={cancelEdit}
                  active={i.status} onToggle={() => toggle(i)}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="text-center text-muted">None found.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

function UnitMaster({ items, companies, companyName, onSaved }) {
  const [form, setForm] = useState({ company: '', name: '', short_name: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.createUnit(form)
      setForm({ company: '', name: '', short_name: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (i) => { setEditingId(i.id); setEditData({ name: i.name, short_name: i.short_name }) }
  const cancelEdit = () => { setEditingId(null); setEditData({}) }
  const saveEdit = async (id) => {
    try {
      await api.updateUnit(id, editData)
      setEditingId(null)
      onSaved()
    } catch { alert('Failed to save.') }
  }
  const toggle = async (i) => {
    try {
      await api.updateUnit(i.id, { status: !i.status })
      onSaved()
    } catch { alert('Failed to update status.') }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card card-body mb-4">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Company</label>
            <select className="form-select" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required>
              <option value="">-- Select --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Name</label>
            <input className="form-control" placeholder="Kilogram" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="col-md-3">
            <label className="form-label">Short Name</label>
            <input className="form-control" placeholder="kg" value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} required />
          </div>
          <div className="col-md-2">
            <button className="btn btn-success w-100" disabled={submitting}>Add</button>
          </div>
        </div>
      </form>
      <table className="table table-striped">
        <thead><tr><th>Name</th><th>Short</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                ) : i.name}
              </td>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editData.short_name}
                    onChange={(e) => setEditData({ ...editData, short_name: e.target.value })} />
                ) : i.short_name}
              </td>
              <td>{companyName(i.company)}</td>
              <td><span className={`badge ${i.status ? 'bg-success' : 'bg-secondary'}`}>{i.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                <RowActions
                  editing={editingId === i.id}
                  onEdit={() => startEdit(i)} onSave={() => saveEdit(i.id)} onCancel={cancelEdit}
                  active={i.status} onToggle={() => toggle(i)}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="text-center text-muted">None found.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

function GstMasterTab({ items, companies, companyName, onSaved }) {
  const [form, setForm] = useState({ company: '', name: '', percentage: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.createGstMaster(form)
      setForm({ company: '', name: '', percentage: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (i) => { setEditingId(i.id); setEditData({ name: i.name, percentage: i.percentage }) }
  const cancelEdit = () => { setEditingId(null); setEditData({}) }
  const saveEdit = async (id) => {
    try {
      await api.updateGstMaster(id, editData)
      setEditingId(null)
      onSaved()
    } catch { alert('Failed to save.') }
  }
  const toggle = async (i) => {
    try {
      await api.updateGstMaster(i.id, { status: !i.status })
      onSaved()
    } catch { alert('Failed to update status.') }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card card-body mb-4">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Company</label>
            <select className="form-select" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required>
              <option value="">-- Select --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Name</label>
            <input className="form-control" placeholder="GST 18%" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="col-md-3">
            <label className="form-label">Percentage</label>
            <input type="number" step="0.01" className="form-control" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} required />
          </div>
          <div className="col-md-2">
            <button className="btn btn-success w-100" disabled={submitting}>Add</button>
          </div>
        </div>
      </form>
      <table className="table table-striped">
        <thead><tr><th>Name</th><th>%</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                ) : i.name}
              </td>
              <td>
                {editingId === i.id ? (
                  <input type="number" step="0.01" className="form-control form-control-sm" value={editData.percentage}
                    onChange={(e) => setEditData({ ...editData, percentage: e.target.value })} />
                ) : i.percentage}
              </td>
              <td>{companyName(i.company)}</td>
              <td><span className={`badge ${i.status ? 'bg-success' : 'bg-secondary'}`}>{i.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                <RowActions
                  editing={editingId === i.id}
                  onEdit={() => startEdit(i)} onSave={() => saveEdit(i.id)} onCancel={cancelEdit}
                  active={i.status} onToggle={() => toggle(i)}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="text-center text-muted">None found.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

function WarehouseTab({ items, companies, companyName, branches, onSaved }) {
  const [form, setForm] = useState({ company: '', branch: '', name: '', code: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const visibleBranches = branches.filter((b) => String(b.company) === String(form.company))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const payload = { ...form, branch: form.branch || null }
      await api.createWarehouse(payload)
      setForm({ company: '', branch: '', name: '', code: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (i) => { setEditingId(i.id); setEditData({ name: i.name, code: i.code }) }
  const cancelEdit = () => { setEditingId(null); setEditData({}) }
  const saveEdit = async (id) => {
    try {
      await api.updateWarehouse(id, editData)
      setEditingId(null)
      onSaved()
    } catch { alert('Failed to save.') }
  }
  const toggle = async (i) => {
    try {
      await api.updateWarehouse(i.id, { status: !i.status })
      onSaved()
    } catch { alert('Failed to update status.') }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card card-body mb-4">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">Company</label>
            <select className="form-select" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value, branch: '' })} required>
              <option value="">-- Select --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Branch (optional)</label>
            <select className="form-select" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} disabled={!form.company}>
              <option value="">-- None --</option>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Name</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="col-md-2">
            <label className="form-label">Code</label>
            <input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="col-md-1">
            <button className="btn btn-success w-100" disabled={submitting}>Add</button>
          </div>
        </div>
      </form>
      <table className="table table-striped">
        <thead><tr><th>Name</th><th>Code</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                ) : i.name}
              </td>
              <td>
                {editingId === i.id ? (
                  <input className="form-control form-control-sm" value={editData.code}
                    onChange={(e) => setEditData({ ...editData, code: e.target.value })} />
                ) : i.code}
              </td>
              <td>{companyName(i.company)}</td>
              <td><span className={`badge ${i.status ? 'bg-success' : 'bg-secondary'}`}>{i.status ? 'Active' : 'Inactive'}</span></td>
              <td>
                <RowActions
                  editing={editingId === i.id}
                  onEdit={() => startEdit(i)} onSave={() => saveEdit(i.id)} onCancel={cancelEdit}
                  active={i.status} onToggle={() => toggle(i)}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="text-center text-muted">None found.</td></tr>}
        </tbody>
      </table>
    </>
  )
}