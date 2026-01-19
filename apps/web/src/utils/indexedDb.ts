export interface IndexedDbStoreOptions {
  dbName: string;
  storeName: string;
  version: number;
  keyPath: string;
}

export class IndexedDbStore<T extends object> {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private options: IndexedDbStoreOptions) {}

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, this.options.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.options.storeName)) {
          db.createObjectStore(this.options.storeName, { keyPath: this.options.keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async put(record: T): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.options.storeName, 'readwrite');
      const store = transaction.objectStore(this.options.storeName);
      store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async putMany(records: T[]): Promise<void> {
    if (!records.length) return;
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.options.storeName, 'readwrite');
      const store = transaction.objectStore(this.options.storeName);
      for (const record of records) {
        store.put(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getAll(): Promise<T[]> {
    const db = await this.open();
    return await new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(this.options.storeName, 'readonly');
      const store = transaction.objectStore(this.options.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.options.storeName, 'readwrite');
      const store = transaction.objectStore(this.options.storeName);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
