import * as db from "../db"
import intl from "react-intl-universal"
import { create } from 'zustand'
import { RSSSource, SourceState, starredCount, unreadCount } from '../models/source'
import { fetchFavicon } from "../utils";
import { useApp, useAppActions } from "./app-store";
import { MARK_READ, MARK_UNREAD, RSSItem, insertItems } from "../models/item";
import { devtools } from "zustand/middleware";
import { useFeedActions } from "./feed-store";
import { useGroupActions, useGroups } from "./group-store";

type SourceInTypes = {
    batch: boolean;
}

type SourceStore = {
    sources: SourceState;
    sourceInTypes?: SourceInTypes;
    actions: {
        initSourcesRequest: () => void;
        initSourcesSuccess: (sources: SourceState) => void;
        initSources: () => Promise<void>;
        insertSource: (source: RSSSource) => Promise<RSSSource>;
        addSourceSuccess: (source: RSSSource, batch: boolean) => void;
        updateSource: (source: RSSSource) => Promise<void>;
        updateFavicon: (sids?: number[], force?: boolean) => Promise<void>;
        deleteSourceDone: (source: RSSSource) => void;
        deleteSource: (source: RSSSource, batch?: boolean) => Promise<void>;
        deleteSources: (sources: RSSSource[]) => Promise<void>;
        updateUnreadCounts: () => Promise<void>;
        updateStarredCounts: () => Promise<void>;
        addSourceRequest: (batch: boolean) => void;
        addSourceFailure: (err: Error, batch: boolean) => void;
        addSource: (url: string, name?: string, batch?: boolean) => Promise<number>;
        markReadDone: (item: RSSItem, type?: string) => void;
        markUnreadDone: (item: RSSItem) => void;
        toggleStarredDone: (item: RSSItem) => void;
        toggleSourceHidden: (source: RSSSource) => void;
        markAllReadDone(sids: number[], time: number): void;
    }
}


let insertPromises = Promise.resolve();
const useSourceStore = create<SourceStore>()(devtools((set, get) => ({
    sources: {},
    actions: {
        initSourcesRequest: () => {
            console.log('~~initSourcesRequest~~');
        },
        initSourcesSuccess: (sources: SourceState) => {
            set({ sources: sources });
            // [appReducer]
            useAppActions().initSourcesSuccess();
            // [feedReducer]
        },
        initSources: async () => {
            get().actions.initSourcesRequest();
            // 查询数据库中的数据源，并初始化时把 [unreadCount, starredCount] 都置空，再重新计算
            await db.init();
            const sources = ( await db.sourcesDB.select().from(db.sources).exec() ) as RSSSource[];
            const state: SourceState = {};
            for (let source of sources) {
                source.unreadCount = 0;
                source.starredCount = 0;
                state[source.sid] = source;
            }
            await unreadCount(state);
            await starredCount(state);
            // 订阅源分组
            useGroupActions().fixBrokenGroups(state);
            get().actions.initSourcesSuccess(state);
        },
        insertSource: (source: RSSSource) => {
            return new Promise((resolve, reject) => {
                console.log('~~insertSource~~');
                insertPromises = insertPromises.then(async () => {
                    let sids = Object.values(useSourceStore.getState().sources).map(s => s.sid);
                    source.sid = Math.max(...sids, -1) + 1;
                    const row = db.sources.createRow(source);
                    try {
                        const inserted = (await db.sourcesDB
                            .insert()
                            .into(db.sources)
                            .values([row])
                            .exec()) as RSSSource[]
                        resolve(inserted[0]);
                    } catch (err) {
                        if (err.code === 201) {
                            reject(intl.get("sources.exist"));
                        } else {
                            reject(err);
                        }
                    }
                })
            })
        },
        addSourceSuccess: (source: RSSSource, batch: boolean) => {
            set({
                sources: {
                    ...get().sources,
                    [source.sid]: source
                },
                sourceInTypes: {
                    batch: batch
                }
            });
        },
        updateSource: async (source: RSSSource) => {
            let sourceCopy = { ...source };
            delete sourceCopy.unreadCount;
            delete sourceCopy.starredCount;
            const row = db.sources.createRow(sourceCopy);
            await db.sourcesDB.insertOrReplace().into(db.sources).values([row]).exec();
            set((state) => ({ sources: { ...state.sources, [source.sid]: source } }));
        },
        updateFavicon: async (sids?: number[], force = false) => {
            const initSources = useSourceStore.getState().sources;
            if (!sids) {
                sids = Object.values(initSources)
                    .filter(s => s.iconurl === undefined)
                    .map(s => s.sid);
            } else {
                sids = sids.filter(sid => sid in initSources);
            }
            const promises = sids.map(async sid => {
                const url = initSources[sid].url;
                let favicon = (await fetchFavicon(url)) || "";
                const source = useSourceStore.getState().sources[sid];
                if (source && source.url === url && (force || source.iconurl === undefined)) {
                    source.iconurl = favicon;
                    get().actions.updateSource(source);
                }
            })
            await Promise.all(promises);
        },
        deleteSourceDone: (source: RSSSource) => {
            const state = get().sources;
            delete state[source.sid];
            set({ sources: { ...state } });
            // [otherReducer]
        },
        deleteSource: async (source: RSSSource, batch = false) => {
            return new Promise(async (_resolve, reject) => {
                if (!batch) {
                    useAppActions().saveSettings();
                }
                try {
                    await db.itemsDB.delete().from(db.items).where(db.items.source.eq(source.sid)).exec();
                    await db.sourcesDB.delete().from(db.sources).where(db.sources.sid.eq(source.sid)).exec();
                    get().actions.deleteSourceDone(source);
                    window.settings.saveGroups(useGroups());
                } catch (err) {
                    console.log(err);
                    reject(err);
                } finally {
                    if (!batch) {
                        useAppActions().saveSettings();
                    }
                }
            });
        },
        deleteSources: async (sources: RSSSource[]) => {
            useAppActions().saveSettings();
            for (let source of sources) {
                await get().actions.deleteSource(source, true);
            }
            useAppActions().saveSettings();
        },
        updateUnreadCounts: async () => {
            const sources: SourceState = {};
            for (let source of Object.values(get().sources)) {
                sources[source.sid] = {
                    ...source,
                    unreadCount: 0,
                }
            }
            set({ sources: await unreadCount(sources) });
        },
        updateStarredCounts: async () => {
            const sources: SourceState = {};
            for (let source of Object.values(useSourceStore.getState().sources)) {
                sources[source.sid] = {
                    ...source,
                    starredCount: 0,
                }
            }
            set({ sources: await starredCount(sources) });
        },
        addSourceRequest: (batch: boolean) => {
            set({ sourceInTypes: { batch: batch } });
        },
        addSourceFailure: (err: Error, batch: boolean) => {
            console.log('~~addSourceFailure~~', err);
            set({ sourceInTypes: { batch: batch } });
        },
        addSource: async (url: string, name: string = null, batch = false) => {
            const app = useApp();
            console.log('addSource~~', app);
            if (app.sourceInit) {
                get().actions.addSourceRequest(batch);
                const source = new RSSSource(url, name);
                try {
                    console.log('addSource in', source);
                    const feed = await RSSSource.fetchMetaData(source);
                    const inserted = await get().actions.insertSource(source);
                    inserted.unreadCount = feed.items.length;
                    inserted.starredCount = 0;
                    get().actions.addSourceSuccess(inserted, batch);
                    window.settings.saveGroups(useGroups());
                    get().actions.updateFavicon([inserted.sid]);
                    const items = await RSSSource.checkItems(inserted, feed.items);
                    await insertItems(items);
                    return inserted.sid;
                } catch (e) {
                    get().actions.addSourceFailure(e, batch);
                    if (!batch) {
                        window.utils.showErrorBox(
                            intl.get("sources.errorAdd"),
                            String(e),
                            intl.get("context.copy"),
                        );
                    }
                    throw e;
                }
            }
            throw new Error("Sources not initialized.");
        },
        markReadDone: (item: RSSItem, type = MARK_READ) => {
            set((state) => ({
                sources: {
                    ...state.sources,
                    [item.source]: {
                        ...state.sources[item.source],
                        unreadCount: state.sources[item.source].unreadCount + (type === MARK_UNREAD ? 1 : -1)
                    }
                }
            }))
        },
        markUnreadDone: (item: RSSItem) => {
            get().actions.markReadDone(item, MARK_UNREAD);
        },
        toggleStarredDone: (item: RSSItem) => {
            set(state => ({
                sources: {
                    ...state.sources,
                    [item.source]: {
                        ...state[item.source],
                        starredCount: state.sources[item.source].starredCount + (item.starred ? -1 : 1),
                    } as RSSSource
                }
            }))
        },
        toggleSourceHidden: async (source: RSSSource) => {
            const sourceCopy: RSSSource = { ...get().sources[source.sid] };
            sourceCopy.hidden = !sourceCopy.hidden;
            sourceCopy.hidden
                ? useFeedActions().hideSource(sourceCopy)
                : useFeedActions().unhideSource(sourceCopy);
            await get().actions.updateSource(sourceCopy);
        },
        markAllReadDone: (sids: number[], time: number) => {
            set(state => {
                let nextState = { ...state.sources };
                sids.forEach(sid => {
                    nextState[sid] = {
                        ...state.sources[sid],
                        unreadCount: time ? state.sources[sid].unreadCount : 0,
                    }
                })
                return { sources: nextState };
            })
        },
    },
}), { name: "source" }))

export const useSources = () => useSourceStore(state => state.sources);

export const useSourceActions = () => useSourceStore(state => state.actions);