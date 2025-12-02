// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract EventTicketLogic is Initializable, ERC721AUpgradeable, OwnableUpgradeable {
    // --- ENUMS & STRUCTS ---
    enum TicketStatus { Active, Redeemed }

    struct Ticket {
        TicketStatus status;
        uint256 pendingSince;   // thời điểm bắt đầu pending (nếu dùng commit/check-in)
        uint256 salePrice;
        address seller;
        bytes32 commitHash;     // hash commit, FE đang expect field này
    }

    struct EventConfig {
        string name;
        string symbol;
        uint256 ticketPrice;
        uint256 maxSupply;
        string eventURI;
        string baseTokenURI;
        uint256 maxTicketsPerAddress;
        uint256 startPurchaseTime;
        uint256 eventEndTime;
    }

    // --- STATE VARIABLES ---
    uint256 public ticketPrice;
    uint256 public maxSupply;
    string public baseTokenURI;
    uint256 public maxTicketsPerAddress;
    string public eventURI;
    uint256 public startPurchaseTime;
    uint256 public eventEndTime;

    /// @notice Thời gian "pending" mặc định cho vé (FE đọc từ đây)
    uint256 public pendingDuration;

    /// @notice Cờ đánh dấu sự kiện đã bị huỷ bởi admin/organizer
    bool public isCancelled;

    /// @notice Số vé mỗi address đã mua
    mapping(address => uint256) public ticketsPurchased;

    // RBAC
    mapping(address => bool) public validators;
    mapping(address => bool) public admins;
    mapping(address => bool) public organizers;

    mapping(uint256 => Ticket) public tickets;

    // --- EVENTS ---
    event TicketsMinted(address indexed user, uint256 quantity);
    event TicketRedeemed(uint256 indexed tokenID, address validator);
    event TicketListed(uint256 indexed tokenID, uint256 price, address seller);
    event TicketSold(uint256 indexed tokenID, address buyer, uint256 price);
    event TicketUnlisted(uint256 indexed tokenID);
    event RoleUpdated(address indexed user, string role, bool status);

    /// @notice Event khi huỷ sự kiện
    event EventCancelled(address indexed executor, uint256 timestamp);

    /// @notice Event khi cập nhật thông tin event
    event EventInfoUpdated(
        uint256 ticketPrice,
        uint256 maxTicketsPerAddress,
        uint256 startPurchaseTime,
        uint256 eventEndTime,
        string eventURI,
        string baseTokenURI
    );

    // --- CUSTOM ERRORS ---
    error EventEnded();
    error NotStarted();
    error MaxSupplyReached();
    error LimitPerWallet();
    error InsufficientValue();
    error NotValidator();
    error NotAdmin();
    error NotOrganizerOrAdmin();
    error NotOwnerOfTicket();
    error TicketNotActive();
    error TicketNotForSale();
    error TransferFailed();
    error LengthMismatch();
    error EventAlreadyCancelled();
    error EventIsCancelled();

    // --- INITIALIZER ---
    function initialize(
        EventConfig memory config,
        address _owner
    ) external initializerERC721A initializer {
        __ERC721A_init(config.name, config.symbol);
        __Ownable_init(_owner);

        ticketPrice = config.ticketPrice;
        maxSupply = config.maxSupply;
        baseTokenURI = config.baseTokenURI;
        maxTicketsPerAddress = config.maxTicketsPerAddress;
        startPurchaseTime = config.startPurchaseTime;
        eventEndTime = config.eventEndTime;
        eventURI = config.eventURI;

        // default pendingDuration (10 phút), FE đọc từ đây
        pendingDuration = 600;

        // RBAC mặc định: chủ sự kiện là admin/validator/organizer
        admins[_owner] = true;
        validators[_owner] = true;
        organizers[_owner] = true;

        isCancelled = false;
    }

    // --- MODIFIERS ---
    modifier onlyAdmin() {
        if (!admins[msg.sender] && msg.sender != owner()) revert NotAdmin();
        _;
    }

    modifier onlyValidator() {
        if (!validators[msg.sender] && !admins[msg.sender] && msg.sender != owner()) {
            revert NotValidator();
        }
        _;
    }

    /// @notice Cho phép organizer hoặc admin hoặc owner
    modifier onlyOrganizerOrAdmin() {
        if (
            !organizers[msg.sender] &&
            !admins[msg.sender] &&
            msg.sender != owner()
        ) {
            revert NotOrganizerOrAdmin();
        }
        _;
    }

    modifier notCancelled() {
        if (isCancelled) revert EventIsCancelled();
        _;
    }

    // --- VIEW HELPERS ---
    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    /// @notice Lấy danh sách tokenId mà `owner` đang sở hữu
    /// Dùng cho MyTickets & EventGridResales
    function tokensOfOwner(address ownerAddr)
        external
        view
        returns (uint256[] memory)
    {
        uint256 balance = balanceOf(ownerAddr);
        uint256 supply = totalSupply();

        uint256[] memory ids = new uint256[](balance);
        uint256 idx = 0;

        // vì ta không burn nên tokenId hợp lệ là [0, supply - 1]
        for (uint256 tokenId = 0; tokenId < supply; tokenId++) {
            if (ownerOf(tokenId) == ownerAddr) {
                ids[idx] = tokenId;
                idx++;
                if (idx == balance) break;
            }
        }

        return ids;
    }

    /// @notice Lấy danh sách tokenId mà `user` đang rao bán (seller = user & salePrice > 0)
    function ticketsForSaleOfUsr(address user)
        external
        view
        returns (uint256[] memory)
    {
        uint256 supply = totalSupply();
        uint256 count;

        // Đếm trước để cấp phát mảng
        for (uint256 tokenId = 0; tokenId < supply; tokenId++) {
            Ticket storage t = tickets[tokenId];
            if (t.seller == user && t.salePrice > 0) {
                count++;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;

        for (uint256 tokenId = 0; tokenId < supply; tokenId++) {
            Ticket storage t = tickets[tokenId];
            if (t.seller == user && t.salePrice > 0) {
                ids[idx] = tokenId;
                idx++;
            }
        }

        return ids;
    }

    // --- USER FUNCTIONS ---
    function mintTickets(uint256 quantity) external payable notCancelled {
        if (block.timestamp >= eventEndTime) revert EventEnded();
        if (block.timestamp < startPurchaseTime) revert NotStarted();
        if (totalSupply() + quantity > maxSupply) revert MaxSupplyReached();
        if (ticketsPurchased[msg.sender] + quantity > maxTicketsPerAddress) revert LimitPerWallet();
        if (msg.value < ticketPrice * quantity) revert InsufficientValue();

        ticketsPurchased[msg.sender] += quantity;
        _safeMint(msg.sender, quantity);

        emit TicketsMinted(msg.sender, quantity);
    }

    // --- VALIDATOR / ADMIN / ORGANIZER FUNCTIONS ---
    function verifyTicket(uint256 tokenID) external onlyValidator {
        if (tickets[tokenID].status == TicketStatus.Redeemed) revert TicketNotActive();

        tickets[tokenID].status = TicketStatus.Redeemed;
        tickets[tokenID].pendingSince = 0; // clear nếu có pending
        emit TicketRedeemed(tokenID, msg.sender);
    }

    /// @notice Admin/Organizer huỷ sự kiện: đánh dấu isCancelled và set eventEndTime = block.timestamp
    /// FE có thể dùng isCancelled hoặc eventEndTime để lọc
    function cancelEvent() external onlyOrganizerOrAdmin {
        if (isCancelled) revert EventAlreadyCancelled();
        isCancelled = true;
        eventEndTime = block.timestamp;

        emit EventCancelled(msg.sender, block.timestamp);
    }

    /// @notice Organizer/Admin cập nhật thông tin event
    function updateEventInfo(
        uint256 _ticketPrice,
        uint256 _maxTicketsPerAddress,
        uint256 _startPurchaseTime,
        uint256 _eventEndTime,
        string calldata _eventURI,
        string calldata _baseTokenURI
    ) external onlyOrganizerOrAdmin notCancelled {
        ticketPrice = _ticketPrice;
        maxTicketsPerAddress = _maxTicketsPerAddress;
        startPurchaseTime = _startPurchaseTime;
        eventEndTime = _eventEndTime;
        eventURI = _eventURI;
        baseTokenURI = _baseTokenURI;

        emit EventInfoUpdated(
            _ticketPrice,
            _maxTicketsPerAddress,
            _startPurchaseTime,
            _eventEndTime,
            _eventURI,
            _baseTokenURI
        );
    }

    // --- MARKETPLACE ---
    function listTicket(uint256 tokenID, uint256 price) external notCancelled {
        if (ownerOf(tokenID) != msg.sender) revert NotOwnerOfTicket();
        if (tickets[tokenID].status == TicketStatus.Redeemed) revert TicketNotActive();

        Ticket storage t = tickets[tokenID];
        t.seller = msg.sender;
        t.salePrice = price;
        // có thể dùng pendingSince cho logic riêng, tạm thời set 0
        // t.pendingSince = block.timestamp;

        transferFrom(msg.sender, address(this), tokenID);
        emit TicketListed(tokenID, price, msg.sender);
    }

    function addTicketsForSale(
        uint256[] calldata tokenIDs,
        uint256[] calldata prices
    ) external notCancelled {
        if (tokenIDs.length != prices.length) revert LengthMismatch();

        uint256 len = tokenIDs.length;
        for (uint256 i = 0; i < len; i++) {
            this.listTicket(tokenIDs[i], prices[i]);
        }
    }

    function buyTicket(uint256 tokenID) external payable notCancelled {
        Ticket storage tkt = tickets[tokenID];
        if (tkt.seller == address(0)) revert TicketNotForSale();
        if (msg.value < tkt.salePrice) revert InsufficientValue();

        address seller = tkt.seller;
        uint256 price = tkt.salePrice;

        tkt.seller = address(0);
        tkt.salePrice = 0;
        tkt.pendingSince = 0;

        ticketsPurchased[msg.sender]++;

        _approve(msg.sender, tokenID);
        transferFrom(address(this), msg.sender, tokenID);

        (bool ok, ) = payable(seller).call{value: price}("");
        if (!ok) revert TransferFailed();

        emit TicketSold(tokenID, msg.sender, price);
    }

    function unlistTicket(uint256 tokenID) external {
        Ticket storage t = tickets[tokenID];
        if (t.seller != msg.sender) revert NotOwnerOfTicket();

        t.seller = address(0);
        t.salePrice = 0;
        t.pendingSince = 0;

        _approve(msg.sender, tokenID);
        transferFrom(address(this), msg.sender, tokenID);
        emit TicketUnlisted(tokenID);
    }

    // --- ADMIN / ORGANIZER MANAGEMENT ---
    function addAdmin(address _admin) external onlyOwner {
        admins[_admin] = true;
        emit RoleUpdated(_admin, "ADMIN", true);
    }

    function removeAdmin(address _admin) external onlyOwner {
        admins[_admin] = false;
        emit RoleUpdated(_admin, "ADMIN", false);
    }

    function addValidator(address _validator) external onlyAdmin {
        validators[_validator] = true;
        emit RoleUpdated(_validator, "VALIDATOR", true);
    }

    function removeValidator(address _validator) external onlyAdmin {
        validators[_validator] = false;
        emit RoleUpdated(_validator, "VALIDATOR", false);
    }

    /// @notice Admin/Owner cấp role organizer trong phạm vi event này
    function addOrganizer(address _organizer) external onlyAdmin {
        organizers[_organizer] = true;
        emit RoleUpdated(_organizer, "ORGANIZER", true);
    }

    function removeOrganizer(address _organizer) external onlyAdmin {
        organizers[_organizer] = false;
        emit RoleUpdated(_organizer, "ORGANIZER", false);
    }

    // --- WITHDRAW ---
    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }
}
