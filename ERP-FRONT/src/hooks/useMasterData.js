import { useEffect, useMemo, useState } from 'react'
import { getCompanies } from '../api/companies'
import { getBranches } from '../api/branches'
import { getProducts } from '../api/products'
import { getCustomers } from '../api/customers'
import { getSuppliers } from '../api/suppliers'
import { getGstMasters, getUnits, getWarehouses } from '../api/masters'

/**
 * Loads the lookup lists every document screen needs (companies, branches,
 * products, parties, warehouses, GST rates, units) once per page.
 */
export default function useMasterData() {
  const [data, setData] = useState({
    companies: [], branches: [], products: [], customers: [], suppliers: [],
    warehouses: [], gstMasters: [], units: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      getCompanies(), getBranches(), getProducts(), getCustomers(), getSuppliers(),
      getWarehouses(), getGstMasters(), getUnits(),
    ])
      .then(([co, br, pr, cu, su, wh, gst, un]) => {
        setData({
          companies: co.data, branches: br.data, products: pr.data, customers: cu.data,
          suppliers: su.data, warehouses: wh.data, gstMasters: gst.data, units: un.data,
        })
      })
      .catch(() => setError('Failed to load master data.'))
      .finally(() => setLoading(false))
  }, [])

  const helpers = useMemo(() => {
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
    return {
      companyById: byId(data.companies),
      branchById: byId(data.branches),
      productById: byId(data.products),
      customerById: byId(data.customers),
      supplierById: byId(data.suppliers),
      warehouseById: byId(data.warehouses),
      unitById: byId(data.units),
      gstRateById: Object.fromEntries(data.gstMasters.map((g) => [g.id, Number(g.percentage)])),
    }
  }, [data])

  return { ...data, ...helpers, loading, error }
}
