import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox, pruneRedundantOutbox } from '../sync/outbox'
import { apiDeleteCatalog, apiMastersReady, apiPutCatalog, type CatalogKind } from './apiMasters'

/** Push a catalog row online via REST, or enqueue SyncOp when offline. */
export function pushCatalogRow(kind: CatalogKind, row: { id: string; branchId?: string | null }) {
  const branchId = row.branchId ?? null
  const body = { kind, row }
  if (apiMastersReady()) {
    void apiPutCatalog(kind, row as unknown as Record<string, unknown>)
      .then(() => {
        dropPendingUpsertsFor(row.id, 'catalog.upsert')
        pruneRedundantOutbox()
      })
      .catch(() => {
        enqueueOutbox('catalog.upsert', row.id, body, getDeviceId(), branchId)
        pruneRedundantOutbox()
      })
  } else {
    enqueueOutbox('catalog.upsert', row.id, body, getDeviceId(), branchId)
  }
}

export function pushCatalogDelete(kind: CatalogKind, id: string) {
  if (apiMastersReady()) {
    void apiDeleteCatalog(kind, id)
      .then(() => dropPendingUpsertsFor(id, 'catalog.upsert'))
      .catch(() => enqueueOutbox('catalog.delete', id, { kind }, getDeviceId(), null))
  } else {
    enqueueOutbox('catalog.delete', id, { kind }, getDeviceId(), null)
  }
}
