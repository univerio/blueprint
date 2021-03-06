/*
 * Copyright 2017 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the terms of the LICENSE file distributed with this project.
 */

import * as classNames from "classnames";
import * as React from "react";

import {
    HTMLInputProps,
    IInputGroupProps,
    InputGroup,
    IPopoverProps,
    Keys,
    Menu,
    Popover,
    Position,
    Utils,
} from "@blueprintjs/core";
import * as Classes from "../../common/classes";
import { IListItemsProps, IQueryListRendererProps, QueryList } from "../query-list/queryList";

export interface ISuggestProps<T> extends IListItemsProps<T> {
    /**
     * Whether the popover should close after selecting an item.
     * @default true
     */
    closeOnSelect?: boolean;

    /**
     * Props to spread to `InputGroup`. All props are supported except `ref` (use `inputRef` instead).
     * If you want to control the filter input, you can pass `value` and `onChange` here
     * to override `Suggest`'s own behavior.
     */
    inputProps?: IInputGroupProps & HTMLInputProps;

    /** Custom renderer to transform an item into a string for the input value. */
    inputValueRenderer: (item: T) => string;

    /** React child to render when filtering items returns zero results. */
    noResults?: string | JSX.Element;

    /**
     * Whether the popover opens on key down or when the input is focused.
     * @default false
     */
    openOnKeyDown?: boolean;

    /** Props to spread to `Popover`. Note that `content` cannot be changed. */
    popoverProps?: Partial<IPopoverProps> & object;
}

export interface ISuggestState<T> {
    activeItem?: T;
    isOpen?: boolean;
    isTyping?: boolean;
    query?: string;
    selectedItem?: T;
}

export class Suggest<T> extends React.PureComponent<ISuggestProps<T>, ISuggestState<T>> {
    public static displayName = "Blueprint2.Suggest";

    public static ofType<T>() {
        return (Suggest as any) as new () => Suggest<T>;
    }

    public state: ISuggestState<T> = {
        isOpen: false,
        isTyping: false,
        query: "",
    };

    // not using defaultProps, because they're hard to type with generics (can't
    // use <T> on static members). but we still want to keep default values in
    // one, necessarily non-`static` place. note that Partial is necessary to
    // avoid having to define all required props, and all of these values must
    // be referenced manually in code.
    private DEFAULT_PROPS: Partial<ISuggestProps<T>> = {
        closeOnSelect: true,
        inputProps: {},
        openOnKeyDown: false,
        popoverProps: {},
    };

    private input: HTMLInputElement;
    private TypedQueryList = QueryList.ofType<T>();
    private queryList: QueryList<T>;
    private refHandlers = {
        input: (ref: HTMLInputElement) => (this.input = ref),
        queryList: (ref: QueryList<T>) => (this.queryList = ref),
    };

    public render() {
        // omit props specific to this component, spread the rest.
        const { inputProps, noResults, popoverProps, ...restProps } = this.props;

        return (
            <this.TypedQueryList
                {...restProps}
                activeItem={this.state.activeItem}
                onActiveItemChange={this.handleActiveItemChange}
                onItemSelect={this.handleItemSelect}
                query={this.state.query}
                ref={this.refHandlers.queryList}
                renderer={this.renderQueryList}
            />
        );
    }

    public componentDidUpdate(_prevProps: ISuggestProps<T>, prevState: ISuggestState<T>) {
        if (this.state.isOpen && !prevState.isOpen && this.queryList != null) {
            this.queryList.scrollActiveItemIntoView();
        }
    }

    private renderQueryList = (listProps: IQueryListRendererProps<T>) => {
        const {
            inputValueRenderer,
            inputProps = this.DEFAULT_PROPS.inputProps,
            popoverProps = this.DEFAULT_PROPS.popoverProps,
        } = this.props;
        const { isTyping, selectedItem, query } = this.state;
        const { handleKeyDown, handleKeyUp } = listProps;
        const inputValue: string = isTyping ? query : selectedItem ? inputValueRenderer(selectedItem) : "";

        return (
            <Popover
                autoFocus={false}
                enforceFocus={false}
                isOpen={this.state.isOpen}
                position={Position.BOTTOM_LEFT}
                {...popoverProps}
                className={classNames(listProps.className, popoverProps.className)}
                onInteraction={this.handlePopoverInteraction}
                popoverClassName={classNames(Classes.SELECT_POPOVER, popoverProps.popoverClassName)}
                popoverDidOpen={this.handlePopoverDidOpen}
                popoverWillClose={this.handlePopoverWillClose}
            >
                <InputGroup
                    placeholder="Search..."
                    value={inputValue}
                    {...inputProps}
                    inputRef={this.refHandlers.input}
                    onChange={this.handleQueryChange}
                    onFocus={this.handleInputFocus}
                    onKeyDown={this.getTargetKeyDownHandler(handleKeyDown)}
                    onKeyUp={this.getTargetKeyUpHandler(handleKeyUp)}
                />
                <div onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
                    <Menu ulRef={listProps.itemsParentRef}>{this.renderItems(listProps)}</Menu>
                </div>
            </Popover>
        );
    };

    private renderItems({ items, renderItem }: IQueryListRendererProps<T>) {
        const renderedItems = items.map(renderItem).filter(item => item != null);
        return renderedItems.length > 0 ? renderedItems : this.props.noResults;
    }

    private selectText = () => {
        if (this.input != null) {
            // wait until the input is properly focused to select the text inside of it
            requestAnimationFrame(() => this.input.setSelectionRange(0, this.input.value.length));
        }
    };

    private handleInputFocus = (event: React.SyntheticEvent<HTMLInputElement>) => {
        const {
            openOnKeyDown = this.DEFAULT_PROPS.openOnKeyDown,
            inputProps = this.DEFAULT_PROPS.inputProps,
        } = this.props;

        this.selectText();

        if (!openOnKeyDown) {
            this.setState({ isOpen: true });
        }

        Utils.safeInvoke(inputProps.onFocus, event);
    };

    private handleActiveItemChange = (activeItem: T) => this.setState({ activeItem });

    private handleItemSelect = (item: T, event: React.SyntheticEvent<HTMLElement>) => {
        const { closeOnSelect = this.DEFAULT_PROPS.closeOnSelect } = this.props;
        let nextOpenState: boolean;
        if (!closeOnSelect) {
            this.input.focus();
            this.selectText();
            nextOpenState = true;
        } else {
            this.input.blur();
            nextOpenState = false;
        }

        this.setState({
            isOpen: nextOpenState,
            isTyping: false,
            query: "",
            selectedItem: item,
        });

        Utils.safeInvoke(this.props.onItemSelect, item, event);
    };

    private handlePopoverInteraction = (nextOpenState: boolean) =>
        requestAnimationFrame(() => {
            const { popoverProps = {} } = this.props;

            if (this.input != null && this.input !== document.activeElement) {
                // the input is no longer focused so we can close the popover
                this.setState({ isOpen: false });
            }

            Utils.safeInvoke(popoverProps.onInteraction, nextOpenState);
        });

    private handlePopoverDidOpen = () => {
        const { popoverProps = {} } = this.props;

        // scroll active item into view after popover transition completes and all dimensions are stable.
        if (this.queryList != null) {
            this.queryList.scrollActiveItemIntoView();
        }

        Utils.safeInvoke(popoverProps.popoverDidOpen);
    };

    private handlePopoverWillClose = () => {
        const { popoverProps = {} } = this.props;
        const { selectedItem } = this.state;

        // reset the query when the popover close, make sure that the list
        // isn't filtered on when the popover opens next
        this.setState({
            activeItem: selectedItem ? selectedItem : this.props.items[0],
            query: "",
        });

        Utils.safeInvoke(popoverProps.popoverDidOpen);
    };

    private handleQueryChange = (event: React.FormEvent<HTMLInputElement>) => {
        const { inputProps = this.DEFAULT_PROPS.inputProps } = this.props;

        this.setState({
            isTyping: true,
            query: event.currentTarget.value,
        });

        Utils.safeInvoke(inputProps.onChange, event);
    };

    private getTargetKeyDownHandler = (
        handleQueryListKeyDown: React.EventHandler<React.KeyboardEvent<HTMLElement>>,
    ) => {
        return (e: React.KeyboardEvent<HTMLElement>) => {
            const { which } = e;
            const { isTyping, selectedItem } = this.state;
            const {
                inputProps = this.DEFAULT_PROPS.inputProps,
                openOnKeyDown = this.DEFAULT_PROPS.openOnKeyDown,
            } = this.props;

            if (which === Keys.ESCAPE || which === Keys.TAB) {
                this.input.blur();
                this.setState({
                    isOpen: false,
                    selectedItem: isTyping ? undefined : selectedItem,
                });
            } else if (
                openOnKeyDown &&
                which !== Keys.BACKSPACE &&
                which !== Keys.ARROW_LEFT &&
                which !== Keys.ARROW_RIGHT
            ) {
                this.setState({ isOpen: true });
            }

            if (this.state.isOpen) {
                Utils.safeInvoke(handleQueryListKeyDown, e);
            }

            Utils.safeInvoke(inputProps.onKeyDown, e);
        };
    };

    private getTargetKeyUpHandler = (handleQueryListKeyUp: React.EventHandler<React.KeyboardEvent<HTMLElement>>) => {
        return (e: React.KeyboardEvent<HTMLElement>) => {
            const { inputProps = this.DEFAULT_PROPS.inputProps } = this.props;
            if (this.state.isOpen) {
                Utils.safeInvoke(handleQueryListKeyUp, e);
            }
            Utils.safeInvoke(inputProps.onKeyUp, e);
        };
    };
}
