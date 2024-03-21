import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { Nav, INavLink, INavLinkGroup } from "@fluentui/react"
import { SourceGroup } from "../schema-types"
import { SourceState, RSSSource } from "../scripts/models/source"
import { ALL } from "../scripts/models/feed"
import { AnimationClassNames, Stack, FocusZone } from "@fluentui/react"
import { useEffect, useState } from "react"
import React from "react"
import { useToggleMenuStore } from "@renderer/scripts/store/menu-store"

export type MenuProps = {
    status: boolean
    display: boolean
    selected: string
    sources: SourceState
    groups: SourceGroup[]
    searchOn: boolean
    itemOn: boolean
    allArticles: (init?: boolean) => void
    selectSourceGroup: (group: SourceGroup, menuKey: string) => void
    selectSource: (source: RSSSource) => void
    groupContextMenu: (sids: number[], event: React.MouseEvent) => void
    updateGroupExpansion: (
        event: React.MouseEvent<HTMLElement>,
        key: string,
        selected: string
    ) => void
    toggleSearch: () => void
}

export const Menu: React.FC<MenuProps> = ({
    status,
    display,
    selected,
    sources,
    groups,
    searchOn,
    itemOn,
    allArticles,
    selectSourceGroup,
    selectSource,
    groupContextMenu,
    updateGroupExpansion,
    toggleSearch,
}) => {

    const toggleMenuDisplay = useToggleMenuStore(state => state.display);
    const toggleMenu = useToggleMenuStore(state => state.toggleMenu);

    const [menuDisplay, setMenuDisplay] = useState<boolean>(
        window.innerWidth >= 1200 // 初始化时设置菜单状态
    )
    // 宽度在经过 1200 断点时，调用一次 toggleMenu
    const handleResize = () => {
        const shouldDisplayMenu = window.innerWidth >= 1200
        // 两个状态不一样才执行开关，不然会一直进入判断
        if (shouldDisplayMenu !== menuDisplay) {
            setMenuDisplay(shouldDisplayMenu)
            toggleMenu(shouldDisplayMenu)
            window.settings.setDefaultMenu(shouldDisplayMenu)
        }
    }
    useEffect(() => {
        window.addEventListener("resize", handleResize)
        // 当组件首次加载时，就不走 handleResize 的判断了，立即检查窗口的宽度，并设置状态
        if (menuDisplay) {
            toggleMenu(true);
            window.settings.setDefaultMenu(toggleMenuDisplay)
        }
        return () => {
            window.removeEventListener("resize", handleResize)
        }
    }, [menuDisplay])

    const countOverflow = (count: number) => count >= 1000 ? " 999+" : ` ${count}`

    const getLinkGroups = (): INavLinkGroup[] => [
        {
            links: [
                {
                    name: intl.get("search"),
                    ariaLabel:
                        intl.get("search") + (searchOn ? " ✓" : " "),
                    key: "search",
                    icon: "Search",
                    onClick: toggleSearch,
                    url: null,
                },
                {
                    name: intl.get("allArticles"),
                    ariaLabel:
                        intl.get("allArticles") +
                        countOverflow(
                            Object.values(sources)
                                .filter(s => !s.hidden)
                                .map(s => s.unreadCount)
                                .reduce((a, b) => a + b, 0)
                        ),
                    key: ALL,
                    icon: "TextDocument",
                    onClick: () =>
                        allArticles(selected !== ALL),
                    url: null,
                },
            ],
        },
        {
            name: intl.get("menu.subscriptions"),
            links: groups
                .filter(g => g.sids.length > 0)
                .map(g => {
                    if (g.isMultiple) {
                        let sources = g.sids.map(sid => sources[sid])
                        return {
                            name: g.name,
                            ariaLabel:
                                g.name +
                                countOverflow(
                                    sources
                                        .map(s => s.unreadCount)
                                        .reduce((a, b) => a + b, 0)
                                ),
                            key: "g-" + g.index,
                            url: null,
                            isExpanded: g.expanded,
                            onClick: () =>
                                selectSourceGroup(g, "g-" + g.index),
                            links: sources.map(getSource),
                        }
                    } else {
                        return getSource(sources[g.sids[0]])
                    }
                }),
        },
    ]

    const getSource = (s: RSSSource): INavLink => ({
        name: s.name,
        ariaLabel: s.name + countOverflow(s.unreadCount),
        key: "s-" + s.sid,
        onClick: () => selectSource(s),
        iconProps: s.iconurl ? getIconStyle(s.iconurl) : null,
        url: null,
    })

    const getIconStyle = (url: string) => ({
        style: { width: 16 },
        imageProps: {
            style: { width: "100%" },
            src: url,
        },
    })

    const onContext = (item: INavLink, event: React.MouseEvent) => {
        let sids: number[]
        let [type, index] = item.key.split("-")
        if (type === "s") {
            sids = [parseInt(index)]
        } else if (type === "g") {
            sids = groups[parseInt(index)].sids
        } else {
            return
        }
        groupContextMenu(sids, event)
    }

    const _onRenderLink = (link: INavLink): JSX.Element => {
        let count = link.ariaLabel.split(" ").pop()
        return (
            <Stack
                className="link-stack"
                horizontal
                grow
                onContextMenu={event => onContext(link, event)}>
                <div className="link-text">{link.name}</div>
                {count && count !== "0" && (
                    <div className="unread-count">{count}</div>
                )}
            </Stack>
        )
    }

    const _onRenderGroupHeader = (group: INavLinkGroup): JSX.Element => {
        return (
            <p className={"subs-header " + AnimationClassNames.slideDownIn10}>
                {group.name}
            </p>
        )
    }

    return (
        status && (
            <div
                className={"menu-container" + (toggleMenuDisplay ? " show" : "")}
                onClick={() => toggleMenu()}>
                <div
                    className={"menu" + (itemOn ? " item-on" : "")}
                    onClick={e => e.stopPropagation()}>
                    <div className="btn-group">
                        <a
                            className="btn hide-wide"
                            title={intl.get("menu.close")}
                            onClick={() => toggleMenu()}>
                            <Icon iconName="Back" />
                        </a>
                        <a
                            className="btn inline-block-wide"
                            title={intl.get("menu.close")}
                            onClick={() => toggleMenu()}>
                            <Icon
                                iconName={
                                    window.utils.platform === "darwin"
                                        ? "SidePanel"
                                        : "GlobalNavButton"
                                }
                            />
                        </a>
                    </div>
                    <FocusZone
                        as="div"
                        disabled={!display}
                        className="nav-wrapper">
                        <Nav
                            onRenderGroupHeader={_onRenderGroupHeader}
                            onRenderLink={_onRenderLink}
                            groups={getLinkGroups()}
                            selectedKey={selected}
                            onLinkExpandClick={(event, item) =>
                                updateGroupExpansion(
                                    event,
                                    item.key,
                                    selected
                                )
                            }
                        />
                    </FocusZone>
                </div>
            </div>
        )
    )
}
