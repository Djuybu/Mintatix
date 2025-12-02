// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./EventTicketLogic.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EventTicketFactory is Ownable {
    /// @notice Địa chỉ logic contract (implementation) dùng cho clone
    address public immutable eventLogic;

    /// @notice Danh sách các event đã tạo
    address[] public stateEvents;

    /// @notice Admin của factory (giữ lại như yêu cầu)
    mapping(address => bool) public factoryAdmins;

    /// @notice Organizer cấp ở level factory (có quyền tạo event)
    mapping(address => bool) public organizers;

    event EventCreated(address indexed eventAddress, address indexed creator, string name);
    event FactoryAdminUpdate(address indexed admin, bool status);
    event OrganizerUpdate(address indexed organizer, bool status);

    error NotFactoryAdmin();
    error NotOrganizerOrAdmin();

    // Nhận địa chỉ Logic từ bên ngoài
    constructor(address _logicAddress) Ownable(msg.sender) {
        require(_logicAddress != address(0), "Invalid logic address");
        eventLogic = _logicAddress;

        // Owner mặc định là admin & organizer
        factoryAdmins[msg.sender] = true;
        organizers[msg.sender] = true;
    }

    modifier onlyFactoryAdminOrOwner() {
        if (!factoryAdmins[msg.sender] && msg.sender != owner()) {
            revert NotFactoryAdmin();
        }
        _;
    }

    /// @notice Chỉ organizer hoặc factoryAdmin hoặc owner mới được gọi
    modifier onlyOrganizerOrFactoryAdminOrOwner() {
        if (
            !organizers[msg.sender] &&
            !factoryAdmins[msg.sender] &&
            msg.sender != owner()
        ) {
            revert NotOrganizerOrAdmin();
        }
        _;
    }

    // --- TẠO EVENT ---
    /// @notice Hàm tạo Event: chỉ Organizer / FactoryAdmin / Owner
    function createEvent(
        string memory _name,
        string memory _symbol,
        uint256 _ticketPrice,
        uint256 _maxSupply,
        string memory _eventURI,
        string memory _baseTokenURI,
        uint256 _maxTicketsPerAddress,
        uint256 _startPurchaseTime,
        uint256 _eventEndTime
    ) external onlyOrganizerOrFactoryAdminOrOwner returns (address) {
        address clone = Clones.clone(eventLogic);

        EventTicketLogic.EventConfig memory config = EventTicketLogic.EventConfig({
            name: _name,
            symbol: _symbol,
            ticketPrice: _ticketPrice,
            maxSupply: _maxSupply,
            eventURI: _eventURI,
            baseTokenURI: _baseTokenURI,
            maxTicketsPerAddress: _maxTicketsPerAddress,
            startPurchaseTime: _startPurchaseTime,
            eventEndTime: _eventEndTime
        });

        // Owner của event là msg.sender (Organizer/Admin/Owner tạo ra nó)
        EventTicketLogic(clone).initialize(config, msg.sender);

        stateEvents.push(clone);
        emit EventCreated(clone, msg.sender, _name);

        return clone;
    }

    // --- VIEW ---
    function getEvents() external view returns (address[] memory) {
        return stateEvents;
    }

    // --- QUẢN LÝ ADMIN FACTORY ---
    function setFactoryAdmin(address _admin, bool _status) external onlyOwner {
        factoryAdmins[_admin] = _status;
        emit FactoryAdminUpdate(_admin, _status);
    }

    // --- QUẢN LÝ ORGANIZER (GLOBAL) ---
    /// @notice FactoryAdmin hoặc Owner có thể cấp/thu hồi organizer
    function setOrganizer(address _organizer, bool _status) external onlyFactoryAdminOrOwner {
        organizers[_organizer] = _status;
        emit OrganizerUpdate(_organizer, _status);
    }
}
