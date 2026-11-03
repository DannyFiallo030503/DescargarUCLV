import type { CatalogNode } from './catalog'

const dirs = [
  { path: '/Documentales/', name: 'Documentales', parent: '/' },
  { path: '/Infantiles/', name: 'Infantiles', parent: '/' },
  { path: '/Infantiles/Animes/', name: 'Animes', parent: '/Infantiles/' },
  { path: '/Infantiles/Animes/FairyTail/', name: 'Fairy Tail', parent: '/Infantiles/Animes/' },
  { path: '/Infantiles/Animes/FairyTail (2014)/', name: 'Fairy Tail (2014)', parent: '/Infantiles/Animes/' },
  { path: '/Infantiles/Animes/FairyTail - Final Series/', name: 'Fairy Tail Final Series', parent: '/Infantiles/Animes/' },
  { path: '/Infantiles/AnimeFlv/', name: 'AnimeFlv', parent: '/Infantiles/' },
  { path: '/Infantiles/AnimeFlv/4024 Fairy Tail: 100-nen Quest/', name: 'Fairy Tail: 100 Years Quest', parent: '/Infantiles/AnimeFlv/' },
  { path: '/Infantiles/Animes/Peliculas Anime/', name: 'Películas Anime', parent: '/Infantiles/Animes/' },
  { path: '/Infantiles/Animes/Peliculas Anime/Fairy Tail Movie 2 Dragon Cry/', name: 'Fairy Tail: Dragon Cry', parent: '/Infantiles/Animes/Peliculas Anime/' },
]

const files = [
  { path: '/Infantiles/Animes/FairyTail/Fairy001.mp4', name: 'Fairy001.mp4', parent: '/Infantiles/Animes/FairyTail/', sizeBytes: 73400320 },
  { path: '/Infantiles/Animes/FairyTail/Fairy002.mp4', name: 'Fairy002.mp4', parent: '/Infantiles/Animes/FairyTail/', sizeBytes: 73400320 },
  { path: '/Infantiles/Animes/FairyTail/Fairy003.mp4', name: 'Fairy003.mp4', parent: '/Infantiles/Animes/FairyTail/', sizeBytes: 73400320 },
  { path: '/Infantiles/Animes/FairyTail (2014)/Fairy176.mp4', name: 'Fairy176.mp4', parent: '/Infantiles/Animes/FairyTail (2014)/', sizeBytes: 83886080 },
  { path: '/Infantiles/Animes/FairyTail - Final Series/Fairy001.mp4', name: 'Fairy001.mp4', parent: '/Infantiles/Animes/FairyTail - Final Series/', sizeBytes: 94371840 },
  { path: '/Infantiles/AnimeFlv/4024 Fairy Tail: 100-nen Quest/01.mp4', name: '01.mp4', parent: '/Infantiles/AnimeFlv/4024 Fairy Tail: 100-nen Quest/', sizeBytes: 115343360 },
  { path: '/Infantiles/Animes/Peliculas Anime/Fairy Tail Movie 2 Dragon Cry/Dragon Cry.mp4', name: 'Dragon Cry.mp4', parent: '/Infantiles/Animes/Peliculas Anime/Fairy Tail Movie 2 Dragon Cry/', sizeBytes: 849346560 },
]

export const fixtureCatalog: CatalogNode[] = [
  ...dirs.map(({ path, name, parent }) => ({
    id: path,
    parentId: parent === '/' ? '/' : parent,
    parentPath: parent,
    relativePath: path,
    name,
    kind: 'directory' as const,
    sourceUrl: `https://visuales.uclv.cu${path}`,
  })),
  ...files.map(({ path, name, parent, sizeBytes }) => ({
    id: path,
    parentId: parent,
    parentPath: parent,
    relativePath: path,
    name,
    kind: 'file' as const,
    sizeBytes,
    sizeLabel: `${Math.round(sizeBytes / 1024 / 1024)} MiB`,
    sourceUrl: `https://visuales.uclv.cu${path}`,
  })),
]

export const fixtureRoot: CatalogNode = {
  id: '/', parentId: null, parentPath: '', relativePath: '/', name: 'Biblioteca', kind: 'directory',
}
