const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { ethers } = require("hardhat");

module.exports = buildModule("Mintatix", (m) => {
  // =========================================================
  // BƯỚC 1: DEPLOY LOGIC CONTRACT RIÊNG (Giải quyết lỗi Size)
  // =========================================================
  const logicContract = m.contract("EventTicketLogic");

  // =========================================================
  // BƯỚC 2: DEPLOY FACTORY (Truyền địa chỉ Logic vào)
  // =========================================================
  const factory = m.contract("EventTicketFactory", [logicContract]);

  // =========================================================
  // BƯỚC 3: TẠO DỮ LIỆU MẪU (Không thay đổi logic của bạn)
  // =========================================================
  const eventTickets = [];
  const numEvents = 4; 

  const EVENT_NAME = [
    "Strings of Light",
    "Grand Prix",
    "Electric Field",
    "Rising Hoops Championship",
  ];
  const EVENT_SYMBOL = ["SOL", "GP", "EF", "RC"];
  const EVENT_TICKET_PRICE = ethers.parseEther("0.01");
  const EVENT_MAX_SUPPLY = 50000n;
  const EVENT_MAX_TICKETS_PER_ADDRESS = 15n;

  const EVENT_URI = [
    "ipfs://bafkreicjvqt7rb5o2pikboe36y77wkp5hlqdq52hklkdc3wrgwxouwcjba",
    "ipfs://bafkreieqipzkjqw2vskallbs2mlxax7v2uajtb3onh4bd7geq5mp2sje5i",
    "ipfs://bafkreif43u7uwba4fq6ymkdsi2z744h4anqmwau7bs7b4xzzqu34n2cbjy",
    "ipfs://bafkreighhg22ghjg5ce4wyzsncoqo2h4bxfsijibkun4yza643h6tab5d4",
  ];

  const EVENT_BASE_TOKEN_URI = [
    "ipfs://bafkreifg2ie7adzzqoeybnxqfgeoi3jkikizrxzxkzwrzx7tc4gjsb6lfe",
    "ipfs://bafkreigndkkwdp2p2ijbhy2ciozhwog7fgdd4dnnpare4e3f5eof453gra",
    "ipfs://bafkreicqyuwj4dcpbxdv4w2u6ywdvj2kxyo4zvosqxnchbb2bd2i4q6tgm",
    "ipfs://bafkreidqujifdyppudhdvqw6mp2sql4aw7jnnhzo7xhjsczvjdb3i3rzhe",
  ];

  // Setup thời gian (Lưu ý: Date.now() chạy lúc build module)
  const now = BigInt(Math.floor(Date.now() / 1000)); 

  const SECOND = 1n;
  const MINUTE = 60n * SECOND;
  const HOUR = 60n * MINUTE;
  const DAY = 24n * HOUR;

  const START_PURCHASE_TIME = [
    now,
    now + 1n * HOUR,
    now + 2n * HOUR,
    now + 3n * HOUR,
  ];

  const EVENT_END_TIME = [
    now + 7n * DAY,   
    now + 14n * DAY, 
    now + 21n * DAY, 
    now + 30n * DAY, 
  ];

  // =========================================================
  // BƯỚC 4: VÒNG LẶP TẠO EVENT
  // =========================================================
  for (let i = 0; i < numEvents; i++) {
    const createEventTx = m.call(
      factory,
      "createEvent",
      [
        EVENT_NAME[i],
        EVENT_SYMBOL[i],
        EVENT_TICKET_PRICE,
        EVENT_MAX_SUPPLY,
        EVENT_URI[i],
        EVENT_BASE_TOKEN_URI[i],
        EVENT_MAX_TICKETS_PER_ADDRESS,
        START_PURCHASE_TIME[i],
        EVENT_END_TIME[i],
      ],
      { id: "createEvent_" + EVENT_SYMBOL[i] }
    );

    // Đọc địa chỉ event vừa tạo từ log
    const eventAddress = m.readEventArgument(
      createEventTx,
      "EventCreated",
      "eventAddress",
      { id: "readEvent_" + EVENT_SYMBOL[i] }
    );

    // Gắn ABI để tương tác về sau (trả về instance contract)
    const eventTicket = m.contractAt("EventTicketLogic", eventAddress, {
      id: "proxy_" + EVENT_SYMBOL[i],
    });

    eventTickets.push(eventTicket);
  }

  // Trả về Logic, Factory và danh sách các Event đã tạo
  return { logicContract, factory, ...eventTickets };
});