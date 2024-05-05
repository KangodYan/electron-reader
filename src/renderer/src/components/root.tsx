import * as React from "react"
import { connect } from "react-redux"
import { closeContextMenu } from "../scripts/models/app"
import { RootState } from "../scripts/reducer"
import Page from "./page"
import ContextMenu from "./context-menu"
import LogMenu from "./log-menu"
import Nav from "./nav"
import Settings from "./settings"
import Menu from "./menu"

const Root = ({ locale, dispatch }) =>
    locale && (
        <div
            id="root"
            key={locale}
            onMouseDown={() => dispatch(closeContextMenu())}>
            <Nav />
            <Page />
            <LogMenu />
            <Menu />
            <Settings />
            <ContextMenu />
        </div>
    )

const getLocale = (state: RootState) => ({ locale: state.app.locale })
export default connect(getLocale)(Root)
