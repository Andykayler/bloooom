



function Header() {
    return (
        <>
        <heaader className="header">
        <div className="loogo">
          <i className="fas fa-seedling logo-icon"></i>
          <span>Bloom</span>
        </div>
        <nav className="naav-links">
          <a href="#features" className="naav-link">Features</a>
          <a href="#solutions" className="naav-link">Solutions</a>
          <a href="#pricing" className="naav-link">Pricing</a>
          <a href="#resources" className="naav-link">Resources</a>
        </nav>
        <div className="aauth-buttons">
          <a href="/Login" className="btnn btnn-outline">Sign in</a>
          <a href="/Reg" className="btnn btnn-primary">Sign up</a>
        </div>
      </heaader>
        </>
    )

}

export default Header;