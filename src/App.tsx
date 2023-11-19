import { useEffect, useMemo, useRef, useState } from 'react'
import '@radix-ui/themes/styles.css';
import Editor from '@monaco-editor/react'
import { Slider } from '@radix-ui/themes';
import { Loro, LoroList, LoroMap, OpId, toReadableVersion } from 'loro-crdt';
import deepEqual from 'deep-equal';
import './App.css'

function App() {
  const versionsRef = useRef<OpId[][]>([]);
  const [maxVersion, setMaxVersion] = useState(-1);
  const [docSize, setDocSize] = useState(0);
  const [vv, setVV] = useState("")
  const [editorValue,setEditorValue] = useState("")
  const channel = useMemo(() => {
    return new BroadcastChannel("temp");
  }, []);
  useEffect(() => {
    return () => {
      channel.close();
    }
  }, [channel]);

  const { doc, docElements } = useMemo(() => {
    const doc = new Loro();
    const data = localStorage.getItem("store");
    const docElements = doc.getList("elements");
    let lastVersion: Uint8Array | undefined = undefined;
    channel.onmessage = e => {
      console.log("Event");
      const bytes = new Uint8Array(e.data);
      doc.import(bytes);
    };
    doc.subscribe((e) => {
      const version = Object.fromEntries(toReadableVersion(doc.version()));
      let vv = ""
      for (const [k, v] of Object.entries(version)) {
        vv += `${k.toString().slice(0, 4)}:${v} `
      }

      setVV(vv);
      if (e.local) {
        const bytes = doc.exportFrom(lastVersion);
        lastVersion = doc.version();
        channel.postMessage(bytes);
      }
      if (!e.fromCheckout) {
        versionsRef.current.push(doc.frontiers())
        setMaxVersion(versionsRef.current.length - 1);
        setVersionNum(versionsRef.current.length - 1)
        const data = doc.exportFrom();
        localStorage.setItem("store", btoa(String.fromCharCode(...data)));
        setDocSize(data.length);
      }
      if (e.fromCheckout || !e.local) {
        const value = docElements.getDeepValue().map(({content}:{content:string})=>content).join('\n')
        setEditorValue(value)
      }
    });
    setTimeout(() => {
      if (data && data?.length > 0) {
        const bytes = new Uint8Array(atob(data).split("").map(function (c) { return c.charCodeAt(0) }));
        doc.checkoutToLatest();
        doc.import(bytes);
        setMaxVersion(versionsRef.current.length - 1);
        setVersionNum(versionsRef.current.length - 1)
      }
    }, 100);
    return { doc, docElements }
  }, [channel]);

  function handleEditorChange (value:string | undefined) {
    if(!value) return

    const contentList = value.split('\n')
    const elements:{version:number,content:string}[] = []
    for (const content of contentList) {
      const charList = content.split('')
      let version = 0
      for (const char of charList) {
        version += char.charCodeAt(0)
      }
      elements.push({version,content})
    }
    recordLocalOps(docElements,elements)
    doc.commit()
    lastVersion.current = getVersion(elements)
    setEditorValue(value)
  }


  const [versionNum, setVersionNum] = useState(-1);
  const lastVersion = useRef(-1);
  return (
    <div >
      <div style={{ width: "100%", height: "calc(100vh - 100px)" }}>
        <Editor
         defaultLanguage="javascript"
         value={editorValue}
         onChange={handleEditorChange}
         // theme="nord"
         theme="light"
        />

      </div>
      <div style={{ margin: "1em 2em" }}>
        <div style={{ fontSize: "0.8em" }}>
          <button onClick={() => {
            localStorage.clear();
            location.reload();
          }}>Clear</button> Version Vector {vv}, Doc Size {docSize} bytes
        </div>
        <Slider value={[versionNum]} max={maxVersion} onValueChange={(v) => {
          setVersionNum(v[0]);
          if (v[0] === -1) {
            doc.checkout([]);
          } else {
            if (v[0] === versionsRef.current.length - 1) {
              doc.checkoutToLatest()
            } else {
              doc.checkout(versionsRef.current[v[0]]);
            }
          }
        }} />
      </div>
    </div>
  )
}

function recordLocalOps(loroList: LoroList, elements: readonly { version: number }[]): boolean {
  let changed = false;
  for (let i = loroList.length; i < elements.length; i++) {
    loroList.insertContainer(i, "Map");
    changed = true;
  }

  for (let i = 0; i < elements.length; i++) {
    const map = loroList.get(i) as LoroMap;
    const elem = elements[i];
    if (map.get("version") === elem.version) {
      continue;
    }

    for (const [key, value] of Object.entries(elem)) {
      const src = map.get(key);
      if ((typeof src === "object" && !deepEqual(map.get(key), value)) || src !== value) {
        changed = true;
        map.set(key, value)
      }
    }
  }

  return changed
}

function getVersion(elems: readonly { version: number }[]): number {
  return elems.reduce((acc, curr) => {
    return curr.version + acc
  }, 0)
}

export default App
