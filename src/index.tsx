import { Button, Input } from 'antd';
import {
	createState,
	DataInspector,
	DataTable,
	DataTableColumn,
	DetailSidebar,
	Layout,
	Panel,
	PluginClient,
	useMemoize,
	usePlugin,
	useValue,
} from 'flipper-plugin';
import { apply_patch } from 'jsonpatch';
import React, { useCallback } from 'react';

type Action = {
	type: string;
	payload: object;
};

type InitStoreEvent = {
	id: number;
	time: string;
	action: Action;
	state: object;
};

type ActionEvent = {
	id: number;
	time: string;
	action: Action;
	diff: string | undefined;
};

type StoreData = {
	id: number;
	time: string;
	action: Action;
  previousState: object;
	state: object;
};

type Events = {
	newAction: ActionEvent;
	initStore: InitStoreEvent;
	dispatchAction: Action;
};

type SendEvents = {
	dispatchAction: (params: Action) => Promise<void>;
};

type Row = {
	id: number;
	time: string;
	type: string;
};

const columns: DataTableColumn<Row>[] = [
	{
		key: 'id',
		visible: false,
	},
	{
		key: 'time',
		title: 'Time',
	},
	{
		key: 'type',
		title: 'Type',
	},
];

export function plugin(client: PluginClient<Events, SendEvents>) {
	const storeDatas = createState<StoreData[]>([], { persist: 'storeData' });
	const selectedID = createState<number | null>(null, { persist: 'selectionID' });
	const state = createState<any>({}, { persist: 'state' });
	const actionType = createState<string>();
	const actionPayload = createState<string>();

	client.onMessage('newAction', (newActionEvent) => {
		storeDatas.update((draft) => {
			const diff = newActionEvent.diff;
			const currentState = state.get();
			const newState = apply_patch(currentState, JSON.parse(diff || '[]'));
			state.set(newState);
			draft.push({
				id: newActionEvent.id,
				time: newActionEvent.time,
				action: newActionEvent.action,
				state: newState,
        previousState: currentState,
			});
		});
	});

	client.onMessage('initStore', (initStoreEvent) => {
		state.set(initStoreEvent.state);
	});

	function setSelectionID(id?: number) {
		if (id === undefined) return;
		selectedID.set(id);
	}

	function clear() {
		storeDatas.set([]);
	}

	function setActionType(event: any) {
		actionType.set(event.target.value);
	}

	function setActionPayload(event: any) {
		actionPayload.set(event.target.value);
	}

	async function dispatchAction() {
		if (client.isConnected) {
			try {
				const actionPayloadValue = actionPayload.get();
				let payload;
				try {
					payload = actionPayloadValue?.trim() == '' ? [] : JSON.parse(actionPayloadValue || '');
				} catch (e) {
					payload = actionPayloadValue;
				}

				client.send('dispatchAction', {
					type: actionPayload.get() || '',
					payload: payload,
				});
			} catch (e) {}
		}
	}

	return {
		storeDatas,
		clear,
		selectedID,
		setSelectionID,
		state,
		actionType,
		setActionType,
		actionPayload,
		setActionPayload,
		dispatchAction,
	};
}

export function Component() {
	const instance = usePlugin(plugin);
	const storeDatas = useValue(instance.storeDatas);
	const selectedID = useValue(instance.selectedID);
	const actionType = useValue(instance.actionType);
	const actionPayload = useValue(instance.actionPayload);

	const rows = useMemoize(
		(storeDatas) =>
			storeDatas.map((storeData) => {
				return {
					id: storeData.id,
					type: storeData.action.type,
					time: storeData.time,
				};
			}),
		[storeDatas],
	);

  const onRowSelect = useCallback((row?: { id: number}) => {
    instance.setSelectionID(row?.id)
  }, []);

	return (
		<>
			<DispatchAction
				setActionType={instance.setActionType}
				actionType={actionType}
				actionPayload={actionPayload}
				setActionPayload={instance.setActionPayload}
				onDispatchPress={instance.dispatchAction}
			/>
			<DataTable
				records={rows}
				columns={columns}
				enableSearchbar={true}
				enableColumnHeaders={true}
				enableAutoScroll={true}
				onSelect={onRowSelect}
				extraActions={<Button onClick={instance.clear}>Clear</Button>}
			/>
			<DetailSidebar>
				{selectedID && renderSidebar(storeDatas.find((storeData) => storeData.id === selectedID))}
			</DetailSidebar>
		</>
	);
}

function renderSidebar(storeData?: StoreData) {
	if (storeData === undefined) {
		return null;
	}
	return (
		<Layout.Container gap pad>
			<Panel title="Action" gap pad>
				<DataInspector data={storeData.action} collapsed expandRoot />
			</Panel>
			<Panel title="State" gap pad>
				<DataInspector diff={storeData.previousState} data={storeData.state} expandRoot collapsed />
			</Panel>
		</Layout.Container>
	);
}

type DispatchActionProps = {
	actionType?: string;
	setActionType: (event: any) => void;
	actionPayload?: string;
	setActionPayload: (event: any) => void;
	onDispatchPress: () => void;
};

function DispatchAction({
	actionType,
	actionPayload,
	setActionType,
	setActionPayload,
	onDispatchPress,
}: DispatchActionProps) {
	return (
		<Panel title="Dispatch Action" gap pad collapsed>
			<Input allowClear value={actionType} onChange={setActionType} />
			<Input.TextArea rows={4} value={actionPayload} onChange={setActionPayload} />
			<Button onClick={onDispatchPress}>Dispatch Action</Button>
		</Panel>
	);
}
