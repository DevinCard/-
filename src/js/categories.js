document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch('http://localhost:3000/api/categories');
    const categories = await response.json();
    
    // Update category list in the UI
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
      categories.forEach(category => {
        const categoryElement = document.createElement('div');
        categoryElement.classList.add('category-item');
        categoryElement.innerHTML = `
          <span class="category-emoji">${category.emoji}</span>
          <span class="category-name">${category.name}</span>
        `;
        categoryList.appendChild(categoryElement);
      });
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}); 