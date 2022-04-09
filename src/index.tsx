import { Button, Input, message } from 'antd';
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
//@ts-ignore
import { clone, patch } from 'jsondiffpatch';
import React, { useCallback } from 'react';

type Action = {
  type: string;
  payload: object;
};

type InitStoreEvent = {
  id: string;
  time: string;
  action: Action;
  state: object;
};

interface Delta {
  [key: string]: any;
  [key: number]: any;
}

type ActionEvent = {
  id: string;
  time: string;
  action: Action;
  diff: Delta | undefined;
};

type StoreData = {
  id: string;
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
  id: string;
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

const getDeepValue = function (obj: any, path?: string) {
  let myObj = obj;
  if (!path) {
    return myObj;
  }
  const splitPath = path.split('.');
  for (let i = 0; i < splitPath.length; i++) {
    if (splitPath[i] === '*') {
      return { [path]: myObj };
    }
    myObj = myObj?.[splitPath[i]];
  }
  return { [path]: myObj };
};

export function plugin(client: PluginClient<Events, SendEvents>) {
  const storeDatas = createState<StoreData[]>([], { persist: 'storeData' });
  const selectedID = createState<string | undefined>(undefined, { persist: 'selectionID' });
  const state = createState<any>({}, { persist: 'state' });

  const actionType = createState<string>();
  const actionPayload = createState<string>();

  const stateFilter = createState<string>();
  const filteredState = createState<any>({}, { persist: 'filteredState' });

  client.onMessage('newAction', (newActionEvent) => {
    storeDatas.update((draft) => {
      const delta = newActionEvent.diff;
      const currentState = state.get();
      let newState = undefined;
      try {
        if (delta !== undefined) {
          newState = patch(clone(currentState), delta);
        }
      } catch (e) {
        newState = undefined;
        message.error(`${newActionEvent.action.type}`);
      }
      if (newState === undefined) {
        newState = currentState;
      }

      try {
        const filtered = getDeepValue(newState, stateFilter.get());
        filteredState.set(filtered);
      } catch (e) {
        filteredState.set(newState);
        message.error(`${stateFilter.get()}`);
      }

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

  function setSelectionID(id?: string) {
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
          payload = {};
        }

        client.send('dispatchAction', {
          type: actionType.get() || '',
          payload: payload,
        });
      } catch (e) {}
    }
  }

  function setStateFilter(event: any) {
    const newFilter = event.target.value || '';
    stateFilter.set(newFilter);

    const filtered = getDeepValue(state.get(), newFilter);
    filteredState.set(filtered);
  }

  return {
    storeDatas,
    clear,
    selectedID,
    setSelectionID,
    actionType,
    setActionType,
    actionPayload,
    setActionPayload,
    dispatchAction,
    stateFilter,
    setStateFilter,
    filteredState,
  };
}

export function Component() {
  const instance = usePlugin(plugin);
  const storeDatas = useValue(instance.storeDatas);
  const selectedID = useValue(instance.selectedID);
  const actionType = useValue(instance.actionType);
  const actionPayload = useValue(instance.actionPayload);
  const stateFilter = useValue(instance.stateFilter);
  const filteredState = useValue(instance.filteredState);

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

  const onRowSelect = useCallback((row?: { id: string }) => {
    instance.setSelectionID(row?.id);
  }, []);

  return (
    <>
      <Layout.ScrollContainer vertical>
        <DispatchAction
          setActionType={instance.setActionType}
          actionType={actionType}
          actionPayload={actionPayload}
          setActionPayload={instance.setActionPayload}
          onDispatchPress={instance.dispatchAction}
        />
        <FilterState filter={stateFilter} setFilter={instance.setStateFilter} state={filteredState} />
        <Panel title="Actions" gap pad>
          <DataTable
            records={rows}
            columns={columns}
            enableSearchbar={true}
            enableColumnHeaders={true}
            enableAutoScroll={true}
            onSelect={onRowSelect}
            scrollable={false}
            extraActions={<Button onClick={instance.clear}>Clear</Button>}
          />
        </Panel>
      </Layout.ScrollContainer>
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
      <Input placeholder="Action type" allowClear value={actionType} onChange={setActionType} />
      <Input.TextArea placeholder="Action payload" rows={4} value={actionPayload} onChange={setActionPayload} />
      <Button onClick={onDispatchPress}>Dispatch Action</Button>
    </Panel>
  );
}

type FilterStateProps = {
  filter?: string;
  setFilter: (event: any) => void;
  state: object;
};

function FilterState({ filter, setFilter, state }: FilterStateProps) {
  return (
    <Panel title="State" gap pad collapsed>
      <Input
        placeholder="Type path to observe sub state. E.g myReducerKey.myValue.*"
        allowClear
        value={filter}
        onChange={setFilter}
      />
      <DataInspector data={state} collapsed expandRoot />
    </Panel>
  );
}
