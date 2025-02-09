import { Link, useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { confirm } from "@tauri-apps/api/dialog"
import { Editor } from "../components/Editor"
import {
  FolderHistoryModal,
  LanguageModal,
  VSCodeSnippetSettingsModal,
} from "../components/Modal"
import { getLanguageName, languages } from "../lib/languages"
import { debounce } from "../lib/utils"
import { actions, state } from "../store"
import { Button } from "../components/Button"
import { timeago } from "../lib/date"
import { tooltip } from "../lib/tooltip"

export const Snippets = () => {
  const goto = useNavigate()
  const [searchParams] = useSearchParams<{ folder: string; id?: string }>()
  const [content, setContent] = createSignal("")
  const [getOpenLanguageModal, setOpenLanguageModal] = createSignal(false)
  const [getOpenFolderHistoryModal, setOpenFolderHistoryModal] =
    createSignal(false)
  const [getSearchType, setSearchType] = createSignal<
    null | "non-trash" | "trash"
  >(null)
  const [getSearchKeyword, setSearchKeyword] = createSignal<string>("")
  const [getSelectedSnippetIds, setSelectedSnippetIds] = createSignal<string[]>(
    []
  )
  const [getOpenVSCodeSnippetSettingsModal, setOpenVSCodeSnippetSettingsModal] =
    createSignal<string | undefined>()

  let searchInputEl: HTMLInputElement | undefined

  const snippets = createMemo(() => {
    const keyword = getSearchKeyword().toLowerCase()

    return state.snippets
      .filter((snippet) => {
        const conditions: (string | boolean | undefined | null)[] = []

        conditions.push(
          getSearchType() === "trash" ? snippet.deletedAt : !snippet.deletedAt
        )

        if (keyword) {
          conditions.push(snippet.name.toLowerCase().includes(keyword))
        }

        return conditions.every((v) => v)
      })
      .sort((a, b) => {
        if (a.deletedAt && b.deletedAt) {
          return a.deletedAt > b.deletedAt ? -1 : 1
        }
        return a.createdAt > b.createdAt ? -1 : 1
      })
  })

  const actualSelectedSnippetIds = createMemo(() => {
    const ids = [...getSelectedSnippetIds()]
    if (searchParams.id && snippets().some((s) => s.id === searchParams.id)) {
      ids.push(searchParams.id)
    }
    return ids
  })

  const snippet = createMemo(() =>
    state.snippets.find((snippet) => snippet.id === searchParams.id)
  )

  const isSidebarSnippetActive = (id: string) => {
    return id === snippet()?.id || getSelectedSnippetIds().includes(id)
  }

  const languageExtension = createMemo(() => {
    const lang = languages.find((lang) => lang.id === snippet()?.language)
    return lang && lang.extension
  })

  const newSnippet = async () => {
    const d = new Date()
    const id = actions.getRandomId()
    await actions.createSnippet(
      {
        id,
        name: "Untitled",
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
        language: "plaintext",
      },
      ""
    )
    setSearchType(null)
    goto(`/snippets?${new URLSearchParams({ ...searchParams, id }).toString()}`)
  }

  const handleEditorChange = debounce((value: string) => {
    if (value === content()) return
    console.log("saving content..")
    actions.updateSnippetContent(snippet()!.id, value)
    setContent(value)
  }, 250)

  const moveSnippetToTrashOrRestore = async (id: string) => {
    const snippet = state.snippets.find((snippet) => snippet.id === id)
    if (!snippet) {
      console.error("snippet not found")
      return
    }
    if (snippet.deletedAt) {
      if (
        await confirm(
          `Are you sure you want to restore this snippet from Trash?`
        )
      ) {
        console.log(`restoring ${id}:${snippet.name} from trash`)
        await actions.moveSnippetsToTrash([id], true)
      }
    } else {
      if (await confirm(`Are you sure you want to move it to Trash?`)) {
        console.log(`moving ${id}:${snippet.name} to trash`)
        await actions.moveSnippetsToTrash([id])
      }
    }
  }

  const moveSelectedSnippetsToTrashOrRestore = async () => {
    const restore = getSearchType() === "trash"
    if (
      await confirm(
        restore
          ? `Are you sure you want to restore selected snippets from Trash`
          : `Are you sure you want to move selected snippets to Trash?`
      )
    ) {
      await actions.moveSnippetsToTrash(actualSelectedSnippetIds(), restore)
      setSelectedSnippetIds([])
    }
  }

  const deleteForever = async (id: string) => {
    if (
      await confirm(`Are you sure you want to delete this snippet forever?`)
    ) {
      await actions.deleteSnippetForever(id)
    }
  }

  const emptyTrash = async () => {
    if (
      await confirm(
        `Are you sure you want to permanently erase the items in the Trash?`
      )
    ) {
      await actions.emptyTrash()
    }
  }

  const updateSnippetName = debounce((name: string) => {
    actions.updateSnippet(snippet()!.id, "name", name)
  }, 250)

  createEffect(() => {
    if (getSearchType()) {
      searchInputEl?.focus()
    }
  })

  createEffect(
    on(getSearchType, () => {
      setSearchKeyword("")
    })
  )

  createEffect(() => {
    actions.setFolder(searchParams.folder || null)
  })

  // load snippets from folder
  createEffect(() => {
    if (!searchParams.folder) return

    actions.loadFolder(searchParams.folder)
  })

  // load snippet content
  createEffect(async () => {
    if (!searchParams.id) return

    const content = await actions.readSnippetContent(searchParams.id)
    setContent(content)
  })

  // unselect snippets
  createEffect(
    on([() => searchParams.id, getSearchType], () => {
      setSelectedSnippetIds([])
    })
  )

  return (
    <div class="h-screen">
      <div class="h-main flex">
        <div
          class="border-r w-64 shrink-0 h-full"
          classList={{ "show-search": getSearchType() !== null }}
        >
          <div class="sidebar-header text-zinc-500 text-xs">
            <div
              class="flex items-center justify-between px-2"
              classList={{
                "h-full": getSearchType() === null,
                "h-2/5": getSearchType() !== null,
              }}
            >
              <Button
                type="button"
                onClick={() => setOpenFolderHistoryModal(true)}
                tooltip={{ content: "Select folder" }}
                icon="i-bi:folder"
                class="-ml-[1px] max-w-[50%]"
              >
                {state.folder?.split("/").pop()}
              </Button>
              <div class="flex items-center">
                <Button
                  type="button"
                  icon="i-ic:outline-add"
                  onClick={newSnippet}
                  tooltip={{ content: "New snippet" }}
                ></Button>
                <Button
                  type="button"
                  icon="i-material-symbols:search"
                  onClick={() => {
                    if (getSearchType() === "non-trash") {
                      setSearchType(null)
                      return
                    }
                    setSearchType("non-trash")
                  }}
                  tooltip={{ content: "Show search box" }}
                  isActive={getSearchType() === "non-trash"}
                ></Button>
                <Button
                  type="button"
                  icon="i-iconoir:bin"
                  onClick={() => {
                    if (getSearchType() === "trash") {
                      setSearchType(null)
                      return
                    }
                    setSearchType("trash")
                  }}
                  tooltip={{ content: "Show snippets in trash" }}
                  isActive={getSearchType() === "trash"}
                ></Button>
              </div>
            </div>
            <Show when={getSearchType()}>
              <div class="px-3">
                <div class="flex justify-between h-1/5 pb-1 text-xs">
                  <span class="text-zinc-500">
                    {getSearchType() === "trash" ? "Trash" : "Search"}
                  </span>
                  <Show when={getSearchType() === "trash"}>
                    <button
                      type="button"
                      disabled={snippets().length === 0}
                      class="cursor bg-white whitespace-nowrap border-zinc-400 border h-5/6 rounded-md px-2 flex items-center"
                      classList={{
                        "active:bg-zinc-200": snippets().length !== 0,
                        "disabled:opacity-50": true,
                      }}
                      onClick={emptyTrash}
                    >
                      Empty
                    </button>
                  </Show>
                </div>
                <div class="h-2/5">
                  <input
                    ref={searchInputEl}
                    spellcheck={false}
                    class="h-7 w-full flex items-center px-2 border rounded-lg focus:ring focus:border-blue-500 ring-blue-500 focus:outline-none"
                    value={getSearchKeyword()!}
                    onInput={(e) => setSearchKeyword(e.currentTarget.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault()
                        setSearchType(null)
                      }
                    }}
                  />
                </div>
              </div>
            </Show>
          </div>
          <div class="sidebar-body overflow-y-auto custom-scrollbar scrollbar-group p-2 pt-0 space-y-1">
            <For each={snippets()}>
              {(snippet) => {
                return (
                  <Link
                    href={`/snippets?${new URLSearchParams({
                      ...searchParams,
                      id: snippet.id,
                    }).toString()}`}
                    classList={{
                      "group text-sm px-2 block select-none rounded-lg py-1 cursor":
                        true,
                      "bg-blue-500": isSidebarSnippetActive(snippet.id),
                      "hover:bg-zinc-100": !isSidebarSnippetActive(snippet.id),
                      "text-white": isSidebarSnippetActive(snippet.id),
                    }}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault()
                        setSelectedSnippetIds((ids) => {
                          if (ids.includes(snippet.id)) {
                            return ids.filter((_id) => _id !== snippet.id)
                          }
                          return [...ids, snippet.id]
                        })
                      }
                    }}
                  >
                    <div class="truncate">{snippet.name}</div>
                    <div
                      class="text-xs grid grid-cols-2 gap-1 mt-[1px]"
                      classList={{
                        "text-zinc-300 group-hover:text-zinc-400":
                          !isSidebarSnippetActive(snippet.id),
                        "text-blue-100": isSidebarSnippetActive(snippet.id),
                      }}
                    >
                      <span class="truncate">{timeago(snippet.createdAt)}</span>
                      <div class="flex justify-end items-center">
                        <button
                          type="button"
                          use:tooltip={{
                            content: snippet.vscodeSnippet?.prefix
                              ? snippet.vscodeSnippet.prefix
                              : "Set Snippet Prefix",
                            placement: "top-end",
                          }}
                          class="cursor flex justify-end items-center max-w-full"
                          classList={{
                            "hover:text-white": isSidebarSnippetActive(
                              snippet.id
                            ),
                            "hover:text-zinc-500": !isSidebarSnippetActive(
                              snippet.id
                            ),
                          }}
                          onClick={(e) => {
                            setOpenVSCodeSnippetSettingsModal(snippet.id)
                          }}
                        >
                          <Show
                            when={snippet.vscodeSnippet?.prefix}
                            fallback={
                              <span class="i-fluent:key-command-16-filled text-inherit"></span>
                            }
                          >
                            <span class="truncate">
                              {snippet.vscodeSnippet!.prefix}
                            </span>
                          </Show>
                        </button>
                      </div>
                    </div>
                  </Link>
                )
              }}
            </For>
          </div>
        </div>
        <Show
          when={snippet()}
          fallback={
            <div class="h-full w-full flex items-center justify-center px-20 text-center text-zinc-400 text-xl">
              <span class="select-none">
                Select or create a snippet from sidebar
              </span>
            </div>
          }
        >
          <div class="w-full h-full">
            <div class="border-b flex h-mainHeader items-center px-3 justify-between space-x-3">
              <input
                spellcheck={false}
                value={snippet()!.name}
                class="w-full h-full focus:outline-none"
                onInput={(e) => updateSnippetName(e.currentTarget.value)}
              />
              <div class="flex items-center text-xs text-zinc-500 space-x-1">
                <Button
                  type="button"
                  icon="i-majesticons:curly-braces"
                  onClick={() => setOpenLanguageModal(true)}
                  tooltip={{ content: "Select language mode" }}
                >
                  {getLanguageName(snippet()!.language || "plaintext")}
                </Button>
                <div class="group relative">
                  <Button icon="i-ic:baseline-more-horiz"></Button>
                  <div class="hidden absolute bg-white z-10 py-1 right-0 min-w-[100px] border rounded-lg shadow group-hover:block">
                    <button
                      type="button"
                      class="cursor w-full px-3 h-6 flex items-center whitespace-nowrap hover:bg-zinc-100"
                      onClick={() =>
                        setOpenVSCodeSnippetSettingsModal(snippet()!.id)
                      }
                    >
                      VSCode snippet
                    </button>
                    <button
                      type="button"
                      class="cursor w-full px-3 h-6 flex items-center whitespace-nowrap hover:bg-zinc-100"
                      onClick={() => moveSnippetToTrashOrRestore(snippet()!.id)}
                    >
                      {snippet()!.deletedAt
                        ? "Restore from Trash"
                        : "Move to Trash"}
                    </button>
                    <Show when={snippet()!.deletedAt}>
                      <button
                        type="button"
                        class="cursor w-full px-3 h-6 flex items-center whitespace-nowrap hover:bg-zinc-100"
                        onClick={() => deleteForever(snippet()!.id)}
                      >
                        Delete forever
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
            <div class="h-mainBody overflow-y-auto">
              <Editor
                value={content()}
                onChange={handleEditorChange}
                extensions={languageExtension() ? [languageExtension()!()] : []}
              />
            </div>
          </div>
        </Show>
      </div>
      <footer class="h-footer"></footer>
      <LanguageModal
        open={getOpenLanguageModal()}
        setOpen={setOpenLanguageModal}
        setLanguage={(language) =>
          actions.updateSnippet(snippet()!.id, "language", language)
        }
      />
      <FolderHistoryModal
        open={getOpenFolderHistoryModal()}
        setOpen={setOpenFolderHistoryModal}
      />
      <VSCodeSnippetSettingsModal
        snippetId={getOpenVSCodeSnippetSettingsModal()}
        close={() => setOpenVSCodeSnippetSettingsModal(undefined)}
      />
      <div
        classList={{
          "-bottom-10": getSelectedSnippetIds().length === 0,
          "bottom-10": getSelectedSnippetIds().length > 0,
        }}
        class="fixed left-1/2 transform -translate-x-1/2"
        style="transition: bottom .3s ease-in-out"
      >
        <button
          type="button"
          class="cursor inline-flex items-center bg-white rounded-lg shadow border px-3 h-9 hover:bg-zinc-100"
          onClick={moveSelectedSnippetsToTrashOrRestore}
        >
          {getSearchType() === "trash"
            ? `Restore ${actualSelectedSnippetIds().length} snippets from Trash`
            : `Move ${actualSelectedSnippetIds().length} snippets to Trash`}
        </button>
      </div>
    </div>
  )
}
