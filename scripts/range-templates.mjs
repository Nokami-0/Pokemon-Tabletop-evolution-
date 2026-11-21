export function rangeShapes(range, description = "") {
  const choices = new Map();
  const add = (kind,label,length,width = length,reach = null, targetLimit = null) => {
    if (![length,width,reach ?? 1].every(value=>Number.isFinite(value) && value > 0)) return;
    choices.set(label,{kind,label,length,width,reach,targetLimit});
  };
  for (const part of String(range ?? "").split(/;|\bor\s+(?=(?:self|field|melee|line|close blast|burst|cone|\d)\b)/i)) {
    let match;
    if (match = /\b(\d+(?:\.\d+)?)\s*m?\s*,\s*ranged blast\s+(\d+)/i.exec(part)) {
      add("rangedBlast",`${match[1]} m · Ranged Blast ${match[2]}`,+match[2],+match[2],+match[1]);
    } else if (match = /\b(close blast|burst|line|cone)\s+(\d+(?:\.\d+)?)/i.exec(part)) {
      const kind = match[1].toLowerCase().replace("close blast","closeBlast");
      add(kind,`${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`,+match[2]);
    } else if (/\bmelee\b/i.test(part)) {
      const count = /\b(\d+)\s*targets?\b/i.exec(part);
      if (/\ball\s+adjacent\b/i.test(part)) add("reach","Melee · All adjacent",1);
      else add("target","Melee · "+(count ? count[0] : "1 target"),1,1,1,count ? Number(count[1]) : 1);
    } else if (match = /^\s*(\d+(?:\.\d+)?)\s*m?\s*,\s*(\d+)\s*targets?\b/i.exec(part)) {
      add("target",`${match[1]} m · ${match[2]} target${match[2] === "1" ? "" : "s"}`,1,1,+match[1],+match[2]);
    }
    if (/\bpass\b/i.test(part)) add("line","Pass · up to 4 m",4);
  }
  for (const match of `${range ?? ""} ${description}`.matchAll(/\b(\d+)\s*[x×]\s*(\d+)\s+zone\b/gi)) {
    add("zone",`Zone · ${match[1]} × ${match[2]}`,+match[1],+match[2]);
  }
  const counts = ["one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve"];
  const zoneCount = new RegExp(`\\b(?:zone\\s+of\\s+)?(\\d+|${counts.join("|")})\\s+contiguous(?:\\s+connected)?\\s+(?:spaces|squares)\\b`,"gi");
  for (const match of `${range ?? ""} ${description}`.matchAll(zoneCount)) {
    const count = Number(match[1]) || counts.indexOf(match[1].toLowerCase())+1;
    if (count > 0) add("zoneCells",`Zone · ${count} connected squares`,1,1,null,count);
  }
  return [...choices.values()];
}

export function rangeTemplateData(shape, origin, point, size, units) {
  const rect = (x,y,w,h)=>({t:"rect",x,y,direction:Math.atan2(h,w)*180/Math.PI,distance:Math.hypot(w,h)*units});
  if (["target","zoneCells"].includes(shape.kind)) return rect(point.x,point.y,1,1);
  if (shape.kind === "circle") return {t:"circle",x:point.x,y:point.y,distance:shape.length*units};
  if (shape.kind === "zone" || shape.kind === "rangedBlast" || shape.kind === "closeBlast") {
    return rect(point.x,point.y,shape.length,shape.width);
  }
  if (shape.kind === "centeredZone") {
    return rect(origin.center.x-shape.length*size/2,origin.center.y-shape.width*size/2,shape.length,shape.width);
  }
  if (shape.kind === "reach" || shape.kind === "burst") {
    const radius = shape.length*size;
    return rect(origin.x-radius,origin.y-radius,origin.width/size+2*shape.length,origin.height/size+2*shape.length);
  }
  const dx = point.x-origin.center.x;
  const dy = point.y-origin.center.y;
  if (!dx && !dy) return null;
  const direction = (Math.round(Math.atan2(dy,dx)/(Math.PI/4))*45+360)%360;
  const stepX = Math.round(Math.cos(direction*Math.PI/180));
  const stepY = Math.round(Math.sin(direction*Math.PI/180));
  const actorLine = shape.kind === "line" && Number.isFinite(origin.width);
  const first = actorLine ? {
    x:origin.center.x+(stepX ? stepX*(origin.width/2+size/2) : 0),
    y:origin.center.y+(stepY ? stepY*(origin.height/2+size/2) : 0)
  } : origin.center;
  const distance = Math.min(shape.length,Math.max(1,actorLine ?
    1+Math.round(Math.max((point.x-first.x)*stepX,(point.y-first.y)*stepY)/size) :
    Math.round(Math.max(Math.abs(dx),Math.abs(dy))/size)));
  if (actorLine && stepX && stepY) {
    // A native diagonal ray crosses cells outside a PTE one-square-wide line.
    return Array.from({length:distance},(_,index)=>rect(
      first.x-size/2+stepX*size*index,first.y-size/2+stepY*size*index,1,1));
  }
  return {t:shape.kind === "cone" ? "cone" : "ray",
    x:actorLine ? first.x-stepX*size/2 : origin.center.x,
    y:actorLine ? first.y-stepY*size/2 : origin.center.y,direction,
    distance:(shape.kind === "cone" ? shape.length : distance*(direction%90 ? Math.SQRT2 : 1))*units,
    ...(shape.kind === "cone" ? {angle:90} : {width:units})};
}

let cancelPlacement;

const systemId = "pokemon-tabletop-evolution";

export async function inspectRangeTemplates() {
  if (!canvas.ready) return ui.notifications.warn("Open a scene to manage templates.");
  await ui.controls.activate({control:"templates"});
  ui.notifications.info("Hover a template’s origin handle and press Delete to remove it.");
}

export function tokenRangeOrigin(token, size) {
  const {x,y,width,height} = token.document;
  const w = width*size;
  const h = height*size;
  return {x,y,width:w,height:h,center:{x:x+w/2,y:y+h/2}};
}

function removableTemplates(scene) {
  return [...scene.templates.values()].filter(template=>
    template.getFlag(systemId,"range") &&
    (game.user.isGM || template.author?.id === game.user.id || template._source?.author === game.user.id) &&
    template.canUserModify(game.user,"delete"));
}

async function deleteRangeTemplate(scene, template, candidates) {
  const group = template.getFlag(systemId,"rangeGroup");
  if (!group) return template.delete();
  const members = candidates.filter(item=>item.getFlag(systemId,"rangeGroup") === group);
  return scene.deleteEmbeddedDocuments("MeasuredTemplate",members.map(item=>item.id));
}

export async function removeLastRangeTemplate() {
  if (!canvas.ready) return;
  cancelPlacement?.();
  const scene = canvas.scene;
  const candidates = removableTemplates(scene);
  const latest = candidates.reverse().sort((a,b)=>(b._stats?.createdTime ?? 0)-(a._stats?.createdTime ?? 0))[0];
  if (!latest) return ui.notifications.info("No removable PTE template on this scene.");
  return deleteRangeTemplate(scene,latest,candidates);
}

export function removeRangeOnMap() {
  if (!canvas.ready) return ui.notifications.warn("Open a scene to delete templates.");
  const scene = canvas.scene;
  const board = document.getElementById("board");
  if (!board) return;
  cancelPlacement?.();
  const controller = new AbortController();
  const {signal} = controller;
  const cancel = ()=>{controller.abort();clearTimeout(timer);cancelPlacement=null};
  const timer = setTimeout(cancel,45000);
  cancelPlacement = cancel;
  ui.notifications.info("Click a PTE template to delete it. Press Esc to cancel.");
  window.addEventListener("keydown",event=>{
    if (event.key === "Escape") cancel();
  },{capture:true,signal});
  window.addEventListener("pointerdown",async event=>{
    if (event.target !== board || event.button !== 0) return;
    if (canvas.scene?.id !== scene.id) return cancel();
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
    const candidates = removableTemplates(scene);
    const hit = candidates.reverse().find(template=>{
      const dx = point.x-template.x;
      const dy = point.y-template.y;
      return template.object?.visible !== false &&
        (Math.hypot(dx,dy) <= canvas.grid.size/5 || template.object?.shape?.contains(dx,dy));
    });
    if (!hit) return ui.notifications.info("Click inside a removable PTE template or near its origin handle.");
    cancel();
    try {
      await deleteRangeTemplate(scene,hit,candidates);
    } catch (error) {
      console.error("PTE template deletion failed.",error);
      ui.notifications.error("The template could not be deleted.");
    }
  },{capture:true,signal});
}

export function placeRangeTemplate(shape, token, name, {manual = false} = {}) {
  const scene = canvas.scene;
  const board = document.getElementById("board");
  if (!scene || !board || !canvas.grid.isSquare) return ui.notifications.warn("PTE range placement requires an active square-grid scene.");
  const Template = CONFIG.MeasuredTemplate.documentClass;
  if (!Template.canUserCreate(game.user)) return ui.notifications.warn("You need permission to create measured templates.");
  if (!token && (["centeredZone","burst","closeBlast","rangedBlast"].includes(shape.kind) || (!manual && !["zone","zoneCells"].includes(shape.kind)))) return ui.notifications.warn("Select the move’s source token on the map.");
  const size = canvas.grid.size;
  let origin = token && tokenRangeOrigin(token,size);
  const units = scene.grid.distance;
  const aimed = !["reach","burst","centeredZone"].includes(shape.kind);
  const publish = async data=>{
    const grouped = Array.isArray(data);
    const rangeGroup = grouped ? foundry.utils.randomID() : null;
    const documents = (grouped ? data : [data]).map(template=>({...template,
      author:game.user.id,fillColor:game.user.color,
      flags:{[systemId]:{move:name,range:shape.label,rangeGroup}}
    }));
    const created = await scene.createEmbeddedDocuments("MeasuredTemplate",documents);
    if (created.length && canvas.scene?.id === scene.id) {
      try {
        await inspectRangeTemplates();
      } catch (error) {
        console.warn("PTE could not switch to Measurement Controls.",error);
      }
    }
    return created;
  };
  cancelPlacement?.();
  if (!aimed) return publish(rangeTemplateData(shape,origin,null,size,units));

  const controller = new AbortController();
  const {signal} = controller;
  const cancel = ()=>{controller.abort();clearTimeout(timer);cancelPlacement=null};
  const timer = setTimeout(cancel,45000);
  cancelPlacement=cancel;
  const directional = ["line","cone"].includes(shape.kind);
  const selected = new Map();
  const complete = async data=>{
    cancel();
    try {
      await publish(data);
    } catch (error) {
      console.error("PTE range placement failed",error);
      ui.notifications.error("The range template could not be placed.");
    }
  };
  const instruction = shape.kind === "zoneCells" ?
    `Click ${shape.targetLimit} edge-connected squares. Press Esc to cancel.` : shape.kind === "target" ?
    `Click up to ${shape.targetLimit} target square(s) within ${shape.reach} m. Press Enter to finish early.` : directional ? (manual && !token ? "Click the starting square, then click to aim." : "Click a square to aim from the source token.") :
    shape.kind === "circle" ? "Click the center square." : "Click the upper-left square.";
  ui.notifications.info(`${instruction} Press Esc to cancel.`);
  window.addEventListener("keydown",event=>{
    if (event.key === "Escape") cancel();
    if (event.key === "Enter" && shape.kind === "target" && selected.size && canvas.scene?.id === scene.id) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void complete([...selected.values()]);
    }
  },{capture:true,signal});
  window.addEventListener("pointerdown",async event=>{
    if (event.target !== board || event.button !== 0) return;
    if (canvas.scene?.id !== scene.id) return cancel();
    if (token) {
      if (!scene.tokens.has(token.id)) return cancel();
      origin = tokenRangeOrigin(token,size);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const position = canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
    const offset = canvas.grid.getOffset(position);
    const point = directional || shape.kind === "circle" ? canvas.grid.getCenterPoint(offset) : canvas.grid.getTopLeftPoint(offset);
    if (manual && directional && !origin) {
      origin = {center:point};
      ui.notifications.info("Click a square to aim. Press Esc to cancel.");
      return;
    }
    if (["closeBlast","rangedBlast","target"].includes(shape.kind)) {
      const width = shape.kind === "closeBlast" ? shape.length*size : size;
      const height = shape.kind === "closeBlast" ? shape.width*size : size;
      const dx = Math.max(origin.x-point.x-width+size,point.x-origin.x-origin.width+size,0);
      const dy = Math.max(origin.y-point.y-height+size,point.y-origin.y-origin.height+size,0);
      const distance = Math.max(dx,dy)/size;
      if (shape.kind === "closeBlast" && distance !== 1) {
        return ui.notifications.warn("Place the Close Blast beside the source without overlapping it.");
      }
      if (shape.kind === "target" && (distance < 1 || distance > shape.reach)) {
        return ui.notifications.warn(`Choose a square outside the source and within ${shape.reach} m.`);
      }
      if (shape.kind === "rangedBlast" && distance > shape.reach) {
        return ui.notifications.warn(`Place the upper-left square within ${shape.reach} m of the source.`);
      }
    }
    const data = rangeTemplateData(shape,origin,point,size,units);
    if (!data) return;
    if (shape.kind === "zoneCells") {
      const key = `${point.x},${point.y}`;
      if (selected.has(key)) return;
      const neighbors = [[size,0],[-size,0],[0,size],[0,-size]];
      if (selected.size && !neighbors.some(([dx,dy])=>selected.has(`${point.x+dx},${point.y+dy}`))) {
        return ui.notifications.warn("Choose a square that shares an edge with a selected square.");
      }
      selected.set(key,data);
      if (selected.size === shape.targetLimit) return complete([...selected.values()]);
      return ui.notifications.info(`${selected.size} of ${shape.targetLimit} Zone squares selected.`);
    }
    if (shape.kind === "target") {
      selected.set(`${point.x},${point.y}`,data);
      if (selected.size < shape.targetLimit) {
        return ui.notifications.info(`${selected.size} of ${shape.targetLimit} selected. Click another square or press Enter.`);
      }
      return complete([...selected.values()]);
    }
    return complete(data);
  },{capture:true,signal});
}
