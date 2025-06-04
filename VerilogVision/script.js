// ... (No changes in the initial variable declarations)
const canvas = document.getElementById("canvas");
const wireLayer = document.getElementById("wireLayer");
const gates = [];
const wires = [];
let gateIdCounter = 0;

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

let connectingWire = null;
const GRID_SIZE = 20;

// Drag from left panel to canvas
document.querySelectorAll(".gate-item").forEach(item => {
  item.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", item.dataset.type);
  });
});

canvas.addEventListener("dragover", e => e.preventDefault());

canvas.addEventListener("drop", e => {
  e.preventDefault();
  const type = e.dataTransfer.getData("text/plain");
  if (!type) return;

  const rect = canvas.getBoundingClientRect();
  let x = e.clientX - rect.left - 50;
  let y = e.clientY - rect.top - 30;

  x = Math.round(x / GRID_SIZE) * GRID_SIZE;
  y = Math.round(y / GRID_SIZE) * GRID_SIZE;

  addGate(type, x, y);
  saveState();
  updateGateCount();
});

function addGate(type, x, y) {
  const gate = {
    id: gateIdCounter++,
    type,
    label: type + gateIdCounter,
    x,
    y,
    inputs: [],
    outputs: [],
    isOutput: false  // NEW: default to not an output
  };
  gates.push(gate);
  addGateElement(gate);
  updateGateCount();
}

function addGateElement(gate) {
  const el = document.createElement("div");
  el.classList.add("gate");
  el.style.left = gate.x + "px";
  el.style.top = gate.y + "px";
  el.dataset.id = gate.id;
  el.title = `Type: ${gate.type}`;

  const labelEl = document.createElement("div");
  labelEl.classList.add("gate-label");
  labelEl.textContent = gate.label;
  labelEl.title = "Double-click to rename";
  el.appendChild(labelEl);

  labelEl.addEventListener("dblclick", e => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.type = "text";
    input.value = labelEl.textContent;
    input.style.width = "80px";
    labelEl.replaceWith(input);
    input.focus();

    input.addEventListener("blur", () => {
      if (input.value.trim() !== "") {
        gate.label = input.value.trim();
        labelEl.textContent = gate.label;
      }
      input.replaceWith(labelEl);
      redrawWires();
      saveState();
    });

    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter") input.blur();
      if (ev.key === "Escape") input.replaceWith(labelEl);
    });
  });

  if (gate.type !== "INPUT") {
    let inputCount = (gate.type === "NOT") ? 1 : 2;
    for (let i = 0; i < inputCount; i++) {
      const inputNode = document.createElement("div");
      inputNode.classList.add("node", "input");
      inputNode.style.top = (20 + i * 20) + "px";
      inputNode.dataset.type = "input";
      inputNode.dataset.gateId = gate.id;
      inputNode.dataset.inputIndex = i;
      el.appendChild(inputNode);

      inputNode.addEventListener("click", e => {
        e.stopPropagation();
        if (connectingWire && connectingWire.startNode.dataset.type === "output") {
          const fromGateId = parseInt(connectingWire.startNode.dataset.gateId);
          const toGateId = gate.id;
          const inputIndex = i;

          if (fromGateId === toGateId) {
            alert("Cannot connect a gate to itself.");
            resetConnection();
            return;
          }

          const existingWireIndex = wires.findIndex(w => w.to.gateId === toGateId && w.to.inputIndex === inputIndex);
          if (existingWireIndex !== -1) {
            wires.splice(existingWireIndex, 1);
          }

          wires.push({
            from: { gateId: fromGateId },
            to: { gateId: toGateId, inputIndex }
          });

          resetConnection();
          redrawWires();
          saveState();
        }
      });
    }

    // Add OUTPUT checkbox
    const outputToggle = document.createElement("label");
//     outputToggle.innerHTML = `<input type="checkbox" style="vertical-align: middle;"> Output`;
// //here is the output?
    outputToggle.innerHTML = `
  <span style="display: inline-flex; align-items: center;">
    <input type="checkbox" style="margin-right: 4px;">
    Output
  </span>
`;

    outputToggle.classList.add("output-toggle");

    const checkbox = outputToggle.querySelector("input");
    checkbox.checked = gate.isOutput;

    checkbox.addEventListener("change", () => {
      gate.isOutput = checkbox.checked;
      saveState();
    });

    el.appendChild(outputToggle);
  }

  const outputNode = document.createElement("div");
  outputNode.classList.add("node", "output");
  outputNode.dataset.type = "output";
  outputNode.dataset.gateId = gate.id;
  el.appendChild(outputNode);

  outputNode.addEventListener("click", e => {
    e.stopPropagation();
    if (connectingWire) {
      resetConnection();
      return;
    }
    connectingWire = { startNode: outputNode };
    canvas.classList.add("connecting");
  });

  let offsetX, offsetY, dragging = false;
  el.addEventListener("mousedown", e => {
    if (e.target.classList.contains("gate-label") || e.target.tagName === "INPUT") return;
    dragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    el.style.zIndex = 1000;
  });

  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    let nx = e.clientX - rect.left - offsetX;
    let ny = e.clientY - rect.top - offsetY;

    nx = Math.round(nx / GRID_SIZE) * GRID_SIZE;
    ny = Math.round(ny / GRID_SIZE) * GRID_SIZE;

    nx = Math.max(0, Math.min(rect.width - el.offsetWidth, nx));
    ny = Math.max(0, Math.min(rect.height - el.offsetHeight, ny));

    el.style.left = nx + "px";
    el.style.top = ny + "px";

    gate.x = nx;
    gate.y = ny;

    redrawWires();
  });

  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      el.style.zIndex = "";
      saveState();
    }
  });

  el.addEventListener("mouseenter", () => {
    highlightWiresForGate(gate.id, true);
  });
  el.addEventListener("mouseleave", () => {
    highlightWiresForGate(gate.id, false);
  });

  canvas.appendChild(el);
}


// Reset connection mode
function resetConnection() {
  connectingWire = null;
  canvas.classList.remove("connecting");
}

// Redraw all wires
function redrawWires() {
  // Clear wires
  while (wireLayer.firstChild) wireLayer.removeChild(wireLayer.firstChild);

  wires.forEach(w => {
    const fromGate = gates.find(g => g.id === w.from.gateId);
    const toGate = gates.find(g => g.id === w.to.gateId);
    if (!fromGate || !toGate) return;

    // Get output node center
    const fromEl = canvas.querySelector(`.gate[data-id="${fromGate.id}"] .node.output`);
    const toEl = canvas.querySelector(`.gate[data-id="${toGate.id}"] .node.input[data-input-index="${w.to.inputIndex}"]`);

    if (!fromEl || !toEl) {
      return;
    }

    // Compute positions relative to SVG
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const svgRect = wireLayer.getBoundingClientRect();

    const startX = fromRect.left + fromRect.width / 2 - svgRect.left;
    const startY = fromRect.top + fromRect.height / 2 - svgRect.top;
    const endX = toRect.left + toRect.width / 2 - svgRect.left;
    const endY = toRect.top + toRect.height / 2 - svgRect.top;

    // Draw path with some curve
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const dx = (endX - startX) / 2;
    const dy = 0;
    const d = `M${startX},${startY} C${startX + dx},${startY + dy} ${endX - dx},${endY + dy} ${endX},${endY}`;
    path.setAttribute("d", d);
    path.setAttribute("stroke", "#333");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    path.style.transition = "stroke-width 0.3s ease, stroke 0.3s ease";
    wireLayer.appendChild(path);
    // Store gateIds on path for highlighting
    path.dataset.fromGateId = w.from.gateId;
    path.dataset.toGateId = w.to.gateId;
  });
}

// Highlight wires connected to a specific gate
function highlightWiresForGate(gateId, highlight) {
  const paths = wireLayer.querySelectorAll("path");
  paths.forEach(path => {
    if (parseInt(path.dataset.fromGateId) === gateId || parseInt(path.dataset.toGateId) === gateId) {
      if (highlight) {
        path.classList.add("highlight");
      } else {
        path.classList.remove("highlight");
      }
    }
  });
}

// Canvas click cancels connection mode
canvas.addEventListener("click", e => {
  if (connectingWire) {
    resetConnection();
  }
});

// On canvas mouse move while connecting wire - show a preview line
canvas.addEventListener("mousemove", e => {
  if (!connectingWire) return;
  // Remove any preview line
  let preview = wireLayer.querySelector("path.preview");
  if (preview) wireLayer.removeChild(preview);

  const startNode = connectingWire.startNode;
  const startRect = startNode.getBoundingClientRect();
  const svgRect = wireLayer.getBoundingClientRect();
  const startX = startRect.left + startRect.width / 2 - svgRect.left;
  const startY = startRect.top + startRect.height / 2 - svgRect.top;

  const endX = e.clientX - svgRect.left;
  const endY = e.clientY - svgRect.top;

  const dx = (endX - startX) / 2;
  const dy = 0;
  const d = `M${startX},${startY} C${startX + dx},${startY + dy} ${endX - dx},${endY + dy} ${endX},${endY}`;

  preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.setAttribute("d", d);
  preview.setAttribute("stroke", "#0078d7");
  preview.setAttribute("stroke-width", "2");
  preview.setAttribute("fill", "none");
  preview.classList.add("preview");
  wireLayer.appendChild(preview);
});


function generateVerilog() {
  let code = "";

  const inputs = gates.filter(g => g.type === "INPUT").map(g => g.label);
  const outputs = gates.filter(g => g.isOutput).map(g => g.label);

  if (inputs.length === 0) {
    alert("Add at least one INPUT gate.");
    return;
  }
  if (outputs.length === 0) {
    alert("Mark at least one gate as Output.");
    return;
  }

  code += `module circuit(${inputs.concat(outputs).join(", ")});\n`;
  code += `  input ${inputs.join(", ")};\n`;
  code += `  output ${outputs.join(", ")};\n\n`;

  // internal wires: all non-input, non-output gates
  const internalWires = gates
    .filter(g => g.type !== "INPUT" && !g.isOutput)
    .map(g => g.label);

  if (internalWires.length > 0) {
    code += `  wire ${internalWires.join(", ")};\n\n`;
  }

  // Helper: get label of wire feeding input index i for gate g
  function getInputLabel(gate, i) {
    const w = wires.find(w => w.to.gateId === gate.id && w.to.inputIndex === i);
    if (!w) return "1'b0"; // no input connected, default to 0
    const fromGate = gates.find(g => g.id === w.from.gateId);
    return fromGate ? fromGate.label : "1'b0";
  }

  // Generate logic for each non-input gate
  gates.forEach(gate => {
    if (gate.type === "INPUT") return; // skip inputs

    let verilogLine = "";

    const out = gate.label;

    switch (gate.type) {
      case "AND":
        verilogLine = `assign ${out} = ${getInputLabel(gate, 0)} & ${getInputLabel(gate, 1)};`;
        break;
      case "OR":
        verilogLine = `assign ${out} = ${getInputLabel(gate, 0)} | ${getInputLabel(gate, 1)};`;
        break;
      case "NOT":
        verilogLine = `assign ${out} = ~${getInputLabel(gate, 0)};`;
        break;
      case "NAND":
        verilogLine = `assign ${out} = ~(${getInputLabel(gate, 0)} & ${getInputLabel(gate, 1)});`;
        break;
      case "NOR":
        verilogLine = `assign ${out} = ~(${getInputLabel(gate, 0)} | ${getInputLabel(gate, 1)});`;
        break;
      case "XOR":
        verilogLine = `assign ${out} = ${getInputLabel(gate, 0)} ^ ${getInputLabel(gate, 1)};`;
        break;
      case "XNOR":
        verilogLine = `assign ${out} = ~(${getInputLabel(gate, 0)} ^ ${getInputLabel(gate, 1)});`;
        break;
      default:
        verilogLine = `// Unsupported gate: ${gate.type}`;
    }

    code += `  ${verilogLine}\n`;
  });

  code += "endmodule\n";
  return code;
}


// ... (Keep the rest: redrawWires, undo/redo, resetConnection, etc., unchanged)

// Clear all gates and wires
function clearAll() {
  gates.length = 0;
  wires.length = 0;
  gateIdCounter = 0;
  undoStack.length = 0;
  redoStack.length = 0;

  while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
  while (wireLayer.firstChild) wireLayer.removeChild(wireLayer.firstChild);
  updateGateCount();
  saveState();
}

// Update gate count display
function updateGateCount() {
  const count = gates.length;
  document.getElementById("gateCount").textContent = count;
}

// Undo function
function undo() {
  if (undoStack.length === 0) return;
  const currentState = {
    gates: JSON.parse(JSON.stringify(gates)),
    wires: JSON.parse(JSON.stringify(wires)),
    gateIdCounter
  };
  redoStack.push(currentState);
  const prevState = undoStack.pop();
  restoreState(prevState);
}

// Redo function
function redo() {
  if (redoStack.length === 0) return;
  const currentState = {
    gates: JSON.parse(JSON.stringify(gates)),
    wires: JSON.parse(JSON.stringify(wires)),
    gateIdCounter
  };
  undoStack.push(currentState);
  const nextState = redoStack.pop();
  restoreState(nextState);
}

// Save current state to undo stack and clear redo stack
function saveState() {
  const state = {
    gates: JSON.parse(JSON.stringify(gates)),
    wires: JSON.parse(JSON.stringify(wires)),
    gateIdCounter
  };
  undoStack.push(state);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

// Restore state from snapshot
function restoreState(state) {
  gates.length = 0;
  wires.length = 0;
  state.gates.forEach(g => gates.push(g));
  state.wires.forEach(w => wires.push(w));
  gateIdCounter = state.gateIdCounter;

  while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
  while (wireLayer.firstChild) wireLayer.removeChild(wireLayer.firstChild);

  gates.forEach(g => addGateElement(g));

  redrawWires();
  updateGateCount();
}

// Hook clearAll button
document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Clear all gates and wires?")) {
    clearAll();
  }
});

// Hook generate button
document.getElementById("generateBtn").addEventListener("click", () => {
  const code = generateVerilog();
  document.getElementById("verilogOutput").textContent = code;
});

// Hook undo/redo buttons (make sure you add these in your HTML)
window.undo = undo;
window.redo = redo;

// Initialize with empty state saved
saveState();


  // Download Verilog file
  function downloadVerilog() {
    const code = document.getElementById("verilogOutput").value;
    if (!code) {
      alert("Generate Verilog first!");
      return;
    }
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circuit.v";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Call refreshInputNodeAttributes whenever gates added or moved (we call after adding gate)
  // Note: done inside addGate