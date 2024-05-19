import { useState } from "react";
import { BsmButton } from "renderer/components/shared/bsm-button.component";
import { BsmDropdownButton } from "renderer/components/shared/bsm-dropdown-button.component";
import { BsmSelect, BsmSelectOption } from "renderer/components/shared/bsm-select.component";
import { cn } from "renderer/helpers/css-class.helpers";
import { useConstant } from "renderer/hooks/use-constant.hook";
import { useOnUpdate } from "renderer/hooks/use-on-update.hook";
import { PlaylistSearchParams, BsvSearchOrder } from "shared/models/maps/beat-saver.model";

type Props = {
    className?: string;
    value?: Omit<PlaylistSearchParams, "page">
    onSubmit?: (value: Omit<PlaylistSearchParams, "page">) => void;
}

// TODO : Translate

export function DownloadPlaylistModalHeader({ className, value, onSubmit }: Props) {

    const [query, setQuery] = useState<string>(value?.q || "");
    const [order, setOrder] = useState<BsvSearchOrder>(value?.sortOrder || BsvSearchOrder.Latest);

    const sortOptions: BsmSelectOption<BsvSearchOrder>[] = useConstant(() => {
        return Object.values(BsvSearchOrder).reduce((acc, value) => {
            if(value === BsvSearchOrder.Rating){ return acc; }
            acc.push({ text: `beat-saver.maps-sorts.${value}`, value: value });
            return acc;
        }, []);
    });

    useOnUpdate(() => {
        submit();
    }, [order]);

    const handleOrderChange = (value: BsvSearchOrder) => {
        setOrder(() => value);
    };

    const submit = () => {
        if(!onSubmit){ return; }
        onSubmit({ q: query, sortOrder: order });
    };

    return (
        <form className={cn('flex flex-row gap-2', className)} onSubmit={e => {e.preventDefault(); submit();}}>
            <BsmDropdownButton buttonClassName="flex items-center justify-center h-full rounded-full px-2 py-1 !bg-light-main-color-1 dark:!bg-main-color-1" icon="filter" text="pages.version-viewer.maps.search-bar.filters-btn" withBar={false}>
                <span>Filter Panel</span>
            </BsmDropdownButton>
            <input className="h-full theme-color-1 rounded-full px-2 grow pb-0.5" type="text" placeholder="Rechercher une playlist" value={query} onChange={e => setQuery(e.target.value)} />
            <BsmButton type="submit" className="shrink-0 rounded-full py-1 px-3 !theme-color-1 flex justify-center items-center capitalize" icon="search" text="modals.download-maps.search-btn" withBar={false} />
            <BsmSelect className="theme-color-1 rounded-full px-1 pb-0.5 text-center cursor-pointer" options={sortOptions} selected={order} onChange={handleOrderChange}/>
        </form>
    )
}
