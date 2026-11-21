import {referencePages} from "../data/journal-reference.mjs";

const ID = "pokemon-tabletop-evolution";
const LEGACY_ID = "pte-journal-library";
const folderName = "Pokémon Tabletop Evolution";
const books = [
  ["rulebook", "PTE Rule Book"],
  ["cheat-sheet", "PTE Cheat Sheet"],
  ["pokedex", "PTE Pokédex"],
  ["elementalism", "Path of Elementalism"],
  ["occultism", "Path of Occultism"],
  ["gm-guide", "PTE GM Guide"]
];

const bookKey = entry => entry.flags[ID]?.referenceBook ?? entry.flags[LEGACY_ID]?.book;
const indexEntry = () => game.journal.find(entry=>bookKey(entry) === "index");

export function openJournalLibrary() {
  const entry = indexEntry();
  return entry?.sheet?.render({force:true});
}

export async function installJournalLibrary() {
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  let folder = game.folders.find(item=>item.type === "JournalEntry" &&
    (item.flags[ID]?.referenceLibrary || item.flags[LEGACY_ID]?.library));
  if (!folder) {
    folder = await CONFIG.Folder.documentClass.create({
      name:folderName,type:"JournalEntry",flags:{[ID]:{referenceLibrary:true}}
    });
    if (!folder) throw Error("The PTE Journal folder could not be created.");
  }

  const existing = new Map(game.journal.map(entry=>[bookKey(entry),entry]));
  const entries = books.map(([key,title])=>({
    key,name:title,pages:[{
      name:title,type:"pdf",src:`systems/${ID}/books/${key}.pdf`,title:{show:false}
    }]
  }));
  for (const {key,pages:[book]} of entries) {
    const entry = existing.get(key);
    const oldSource = `modules/${LEGACY_ID}/books/${key}.pdf`;
    const updates = entry?.pages.filter(page=>page.type === "pdf" && page.src === oldSource)
      .map(page=>({_id:page.id,src:book.src}));
    if (updates?.length) await entry.updateEmbeddedDocuments("JournalEntryPage",updates);
  }

  entries.push(...referencePages);
  const toDocument = ({key,name,pages})=>({
    name,folder:folder.id,ownership:{default:observer},flags:{[ID]:{referenceBook:key}},
    pages:pages.map((page,index)=>({...page,sort:(index+1)*100000}))
  });
  const journalClass = CONFIG.JournalEntry.documentClass;
  const missing = entries.filter(entry=>!existing.has(entry.key)).map(toDocument);
  if (missing.length) {
    const created = await journalClass.createDocuments(missing);
    for (const entry of created) existing.set(bookKey(entry),entry);
    if (created.length !== missing.length) throw Error("Some PTE journals could not be created.");
  }
  if (!existing.has("index")) {
    const links = entries.map(({key,name})=>`<li>@UUID[JournalEntry.${existing.get(key).id}]{${name}}</li>`).join("");
    const index = await journalClass.create(toDocument({
      key:"index",name:"PTE Rule Library",pages:[{
        name:"Contents",type:"text",text:{format:1,content:`<h2>Books and References</h2><ul>${links}</ul>`}
      }]
    }));
    if (!index) throw Error("The PTE Rule Library index could not be created.");
  }
  if (missing.length) ui.notifications.info("The PTE Rule Library is ready in the Journal sidebar.");
}
